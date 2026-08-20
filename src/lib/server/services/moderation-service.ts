import "server-only"
import calculateScore from "@/lib/calc-score"
import type { TrialName } from "@/lib/trials"
import type { AuthUser } from "@/lib/server/auth"
import { canModerate } from "@/lib/server/auth"
import { insertAuditLog } from "@/lib/server/audit"
import type { AuditAction } from "@/lib/server/audit"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"
import { refreshAllPlayerScores, refreshPlayerScore } from "@/lib/server/player-scores"
import { refreshPlayerPbs } from "@/lib/server/pbs"
import { refreshWorldRecords } from "@/lib/server/wrs"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"
import {
  deleteBotThread,
  getRankLabel,
  postApprovedRun,
  reportMissingApprovedThread,
  sendDiscordDm,
  updateSubmissionThreadContent,
} from "@/lib/server/notifications"
import {
  deleteSubmissionCascade,
  getPbContext,
  getPlayerScoreContext,
  getSubmissionBase,
  getSubmissionDeleteContext,
  getSubmissionWithScore,
  setSubmissionThreadId,
  updateSubmissionByUuid,
} from "@/lib/server/repositories/submission-repository"
import {
  shouldNotifyModeratorOfChange,
  shouldUpdateSubmissionThread,
} from "@/lib/server/ux-rules"
import {
  normalizeModeratorNote,
  normalizeState,
} from "@/lib/server/moderation-normalization"

type ScorePbRow = {
  trial_name: TrialName
  time: number
}

type PreviousWrRow = {
  trial_name: TrialName
  submission_uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: string
  previous_thread_id: string | null
}

type ModeratorLookupResult = {
  user: AuthUser | null
  error: string | null
  debugInfo: string
}

function scoreFromPbs(
  pbs: ScorePbRow[],
  wrs: Map<TrialName, number>,
  trialCount: number,
  wrTrial?: TrialName
) {
  if (trialCount <= 0) {
    return 0
  }

  let total = 0

  for (const pb of pbs) {
    const trial = pb.trial_name
    const time = Number(pb.time)

    if (!Number.isFinite(time) || time <= 0) {
      continue
    }

    if (wrTrial && trial === wrTrial) {
      total += 1
      continue
    }

    const wr = wrs.get(trial)

    if (!wr || !Number.isFinite(wr)) {
      continue
    }

    total += calculateScore(wr, time, trial)
  }

  return Number((total / Math.max(trialCount, 1)).toFixed(3))
}

function withSubmittedPb(pbs: ScorePbRow[], trialName: string, time: number) {
  const rowsByTrial = new Map<TrialName, ScorePbRow>()

  for (const pb of pbs) {
    rowsByTrial.set(pb.trial_name, { trial_name: pb.trial_name, time: Number(pb.time) })
  }

  const trial = trialName as TrialName
  rowsByTrial.set(trial, { trial_name: trial, time })

  return [...rowsByTrial.values()]
}

function getBotApiKeyFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim()
  }

  return request.headers.get("x-api-key")?.trim()
    || request.headers.get("x-bot-api-key")?.trim()
    || null
}

function isBotApiRequest(request: Request, env: CloudflareEnv) {
  const providedKey = getBotApiKeyFromRequest(request)
  const expectedKey = String(
    (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).botApiKey
    || (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).BOT_API_KEY
    || process.env.botApiKey
    || process.env.BOT_API_KEY
    || ""
  ).trim()

  return Boolean(providedKey && expectedKey && providedKey === expectedKey)
}

function normalizeDiscordId(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const discordId = value.trim()
  return discordId.length > 0 ? discordId : null
}

export async function resolveModeratorUser(
  request: Request,
  env: CloudflareEnv,
  sessionUser: AuthUser | null,
  discordId: unknown,
  requestId: string = "unknown"
): Promise<ModeratorLookupResult> {
  const resolvedDiscordId = normalizeDiscordId(discordId)

  // If session user is already a moderator, return them
  if (canModerate(sessionUser)) {
    console.log(`[${requestId}] Moderator verified via session user: ${sessionUser?.uuid}`)
    return {
      user: sessionUser,
      error: null,
      debugInfo: "Session user has moderator permissions"
    }
  }

  // Check if this is a valid bot API request
  if (!isBotApiRequest(request, env)) {
    console.log(`[${requestId}] Not a bot API request, returning session user (no permissions)`)
    return {
      user: sessionUser,
      error: null,
      debugInfo: "Not a bot API request"
    }
  }

  console.log(`[${requestId}] Bot API request detected`)

  // For bot API requests, Discord ID is required
  if (!resolvedDiscordId) {
    const error = "No Discord ID provided for bot API request"
    console.error(`[${requestId}] ${error}`)
    return {
      user: null,
      error,
      debugInfo: "Discord ID is required for bot API requests"
    }
  }

  console.log(`[${requestId}] Resolving Discord ID: ${resolvedDiscordId}`)

  await ensurePlayerAvatarColumns(env.wasans)

  // Look up the Discord account
  const account = await env.wasans.prepare(
    `SELECT player_uuid
     FROM oauth_accounts
     WHERE provider = 'discord' AND provider_account_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(resolvedDiscordId)
    .first<{ player_uuid: string }>()

  if (!account?.player_uuid) {
    const error = `Discord ID ${resolvedDiscordId} is not linked to any account`
    console.error(`[${requestId}] ${error}`)
    return {
      user: null,
      error,
      debugInfo: "OAuth account not found"
    }
  }

  console.log(`[${requestId}] Found player UUID: ${account.player_uuid}`)

  // Fetch moderator details
  const moderator = await env.wasans.prepare(
    `SELECT players.uuid,
            COALESCE(oauth_accounts.provider_account_id, players.player_id) AS player_id,
            players.player_name,
            players.score,
            players.permission,
            COALESCE(players.account_status, 'active') AS account_status
     FROM players
     LEFT JOIN oauth_accounts
       ON oauth_accounts.player_uuid = players.uuid
       AND oauth_accounts.provider = 'discord'
     WHERE players.uuid = ?
     ORDER BY oauth_accounts.updated_at DESC
     LIMIT 1`
  )
    .bind(account.player_uuid)
    .first<AuthUser & { account_status: string }>()

  if (!moderator) {
    const error = `Player account for Discord ID ${resolvedDiscordId} not found`
    console.error(`[${requestId}] ${error}`)
    return {
      user: null,
      error,
      debugInfo: "Player record not found"
    }
  }

  console.log(`[${requestId}] Found player: ${moderator.player_name} (uuid: ${moderator.uuid}, permission: ${moderator.permission}, status: ${moderator.account_status})`)

  // Check account status
  if (moderator.account_status !== "active") {
    const error = `Account is deactivated (status: ${moderator.account_status})`
    console.error(`[${requestId}] ${error}`)
    return {
      user: null,
      error,
      debugInfo: `Account status is '${moderator.account_status}', not 'active'`
    }
  }

  // Check permission level
  if (!canModerate(moderator)) {
    const error = `User does not have moderator permissions (permission level: ${moderator.permission}, required: >= 1)`
    console.error(`[${requestId}] ${error}`)
    return {
      user: null,
      error,
      debugInfo: `Permission level is ${moderator.permission}, need >= 1`
    }
  }

  console.log(`[${requestId}] Moderator verified: ${moderator.player_name}`)
  return {
    user: moderator,
    error: null,
    debugInfo: "Moderator verified successfully"
  }
}

// Computes each player's score delta caused by a WR change on one trial —
// calculateScore(newWr, theirPbTime) - calculateScore(oldWr, theirPbTime),
// divided by the trial count since that's how it rolls into their overall
// average — then averages that across every player (players with no PB on
// this trial have a delta of 0, and are still counted in the average, since
// "average across all users" includes everyone, not just participants).
async function calculateAverageScoreChangeForWrChange(
  db: D1Database,
  trialName: string,
  oldWr: number | null,
  newWr: number
) {
  const trial = trialName as TrialName
  const now = Math.floor(Date.now() / 1000)

  const [playerCountRow, trialCount, pbResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM players`).first<{ count: number }>(),
    getCountedTrialCount(db, now),
    db.prepare(`SELECT time FROM pbs WHERE trial_name = ?`).bind(trialName).all<{ time: number }>(),
  ])

  const playerCount = Number(playerCountRow?.count ?? 0)

  if (!playerCount || trialCount <= 0) {
    return 0
  }

  let totalDelta = 0

  for (const row of pbResult.results || []) {
    const time = Number(row.time)
    if (!Number.isFinite(time) || time <= 0) {
      continue
    }

    const newScore = calculateScore(newWr, time, trial)
    const oldScore = oldWr && oldWr > 0 ? calculateScore(oldWr, time, trial) : 0
    totalDelta += (newScore - oldScore) / trialCount
  }

  return Number((totalDelta / playerCount).toFixed(4))
}

export async function patchSubmission(
  context: { env: CloudflareEnv; ctx: ExecutionContext; uuid: string; user: AuthUser }
  ,
  payload: {
    state?: unknown
    moderator_note?: unknown
    time?: unknown
  } | null
) {
  const { env, ctx, uuid, user } = context
  const state = normalizeState(payload?.state)
  const moderatorNote = normalizeModeratorNote(payload?.moderator_note)
  const rawTime = payload?.time
  const time = typeof rawTime === "string" && /^[0-9]+(\.[0-9]{1,3})?$/.test(rawTime.trim())
    ? Number(rawTime.trim())
    : typeof rawTime === "number" && Number.isFinite(rawTime)
    ? rawTime
    : null

  if (!state && time === null && moderatorNote === null) {
    throw new Error("State, time, or moderator note must be provided")
  }

  if (time !== null && time <= 0) {
    throw new Error("Time must be a positive number")
  }

  const submission = await getSubmissionBase(env.wasans, uuid)
  if (!submission) {
    throw new Error("Submission was not found")
  }

  const previousState = normalizeState(submission.state) || submission.state
  const updates: Array<{ field: "state" | "moderator_note" | "time" | "moderator_username"; value: string | number | null }> = []

  if (state) {
    updates.push({ field: "state", value: state })
  }

  if (moderatorNote !== null) {
    updates.push({ field: "moderator_note", value: moderatorNote })
  }

  if (time !== null) {
    updates.push({ field: "time", value: time })
  }

  if (updates.length > 0) {
    updates.push({ field: "moderator_username", value: user.player_name })
  }

  await updateSubmissionByUuid(env.wasans, uuid, updates)

  const auditDetails: Record<string, unknown> = { trial_name: submission.trial_name }
  let auditAction: AuditAction = "submission_updated"

  if (state && state !== previousState) {
    auditDetails.old_state = previousState
    auditDetails.new_state = state
    if (state === "approved") {
      auditAction = "submission_approved"
    } else if (state === "denied") {
      auditAction = "submission_denied"
    }
  }

  if (moderatorNote !== null) {
    auditDetails.moderator_note = moderatorNote
  }

  if (time !== null && time !== submission.time) {
    auditDetails.old_time = submission.time
    auditDetails.new_time = time
  }

  await insertAuditLog(env.wasans, auditAction, "submission", uuid, {
    actor: user,
    details: auditDetails,
  })

  const oldPlayer = await getPlayerScoreContext(env.wasans, submission.player_uuid)
  const oldPb = await getPbContext(env.wasans, submission.player_uuid, submission.trial_name)

  const newModeratorNote = moderatorNote !== null ? moderatorNote : submission.moderator_note
  const noteChanged = submission.moderator_note !== newModeratorNote
  const stateChanged = state !== null && state !== previousState
  const timeChanged = time !== null && time !== submission.time

  ctx.waitUntil((async () => {
    try {
      const db = env.wasans
      const [previousWrResult, oldPbResult, trialCount] = await Promise.all([
        db.prepare(
          `SELECT w.trial_name, w.submission_uuid, w.player_uuid, w.player_name, w.time, w.date, s.thread_id AS previous_thread_id
          FROM wrs w
          LEFT JOIN submissions s ON s.uuid = w.submission_uuid`
        )
          .all<PreviousWrRow>(),
        db.prepare(`SELECT trial_name, time FROM pbs WHERE player_uuid = ?`)
          .bind(submission.player_uuid)
          .all<ScorePbRow>(),
        getCountedTrialCount(db, Math.floor(Date.now() / 1000)),
      ])

      const previousWrRows = previousWrResult.results || []
      const oldPbRows = oldPbResult.results || []
      const previousWrRow = previousWrRows.find((row) => row.trial_name === submission.trial_name) ?? null
      const beforeWrTimes = new Map<TrialName, number>(previousWrRows.map((row) => [row.trial_name, Number(row.time)] as const))
      const beforeScore = scoreFromPbs(oldPbRows, beforeWrTimes, trialCount)

      const previousPbRow = previousState === "approved"
        ? await db.prepare(
            `SELECT time FROM submissions
             WHERE player_uuid = ?
               AND trial_name = ?
               AND state = 'approved'
               AND uuid != ?
             ORDER BY time ASC, CAST(date AS INTEGER) ASC, uuid ASC
             LIMIT 1`
          )
            .bind(submission.player_uuid, submission.trial_name, submission.uuid)
            .first<{ time: number }>()
        : null

      const newState = state ?? previousState
      const wasApproved = previousState === "approved"
      const isApproved = newState === "approved"
      const scoreRecalculationNeeded = (stateChanged || timeChanged) && (wasApproved || isApproved)

      await refreshWorldRecords(db, submission.trial_name, user)

      const wrRow = await db.prepare(
        `SELECT w.submission_uuid, w.player_uuid, w.player_name, w.trial_name, w.time, w.date, s.thread_id AS previous_thread_id
         FROM wrs w
         LEFT JOIN submissions s ON s.uuid = w.submission_uuid
         WHERE w.trial_name = ?`
      )
        .bind(submission.trial_name)
        .first<PreviousWrRow | null>()

      const wasWr = previousWrRow?.submission_uuid === submission.uuid
      const isCurrentWr = wrRow?.submission_uuid === submission.uuid
      const shouldRefreshEveryone = scoreRecalculationNeeded && (wasWr || isCurrentWr)

      const updatedSubmission = await getSubmissionWithScore(db, uuid)
      if (!updatedSubmission) {
        return
      }

      const submissionIsWr = wrRow?.submission_uuid === uuid
      const afterWrTimes = new Map(beforeWrTimes)
      if (wrRow) {
        afterWrTimes.set(wrRow.trial_name, Number(wrRow.time))
      }

      const oldPlayerScore = oldPlayer?.score !== undefined ? Number(oldPlayer.score) : undefined
      const updatedTime = Number(updatedSubmission.time)
      const playerScoreBefore = scoreRecalculationNeeded ? beforeScore : oldPlayerScore
      const newPlayerScore = scoreRecalculationNeeded && isApproved
        ? scoreFromPbs(
            withSubmittedPb(oldPbRows, updatedSubmission.trial_name, updatedTime),
            afterWrTimes,
            trialCount,
            submissionIsWr ? (updatedSubmission.trial_name as TrialName) : undefined
          )
        : Number(updatedSubmission.player_score)
      const finalModeratorNote = newModeratorNote ?? submission.moderator_note
      const scoreChanged = typeof playerScoreBefore === "number" && newPlayerScore !== playerScoreBefore
      const oldRankName = typeof playerScoreBefore === "number" ? getRankLabel(playerScoreBefore) : null
      const newRankName = getRankLabel(newPlayerScore)
      const rankChanged = oldRankName !== null && newRankName !== null && oldRankName !== newRankName

      const notificationPlayerId = oldPlayer?.player_id ?? null

      if (shouldNotifyModeratorOfChange({
        oldPlayerId: notificationPlayerId,
        stateChanged,
        noteChanged,
        scoreChanged,
        rankChanged,
      })) {
        let content = `Your submission https://wasans.tully.sh/submissions/${uuid} has been moderated by ${user.player_name}`

        if (stateChanged) {
          content += `\n\nState\n${previousState} -> ${newState}`
        }

        if (noteChanged) {
          const oldNote = submission.moderator_note ?? "N/A"
          const updatedNote = finalModeratorNote ?? "N/A"
          content += `\n\nModerator note\n${oldNote} -> ${updatedNote}`
        }

        if (scoreChanged) {
          content += `\n\nScore\n*${playerScoreBefore?.toFixed(3)}* -> *${newPlayerScore.toFixed(3)}*`
        }

        if (rankChanged) {
          const rankDirection = newPlayerScore > (playerScoreBefore ?? 0) ? "ranked up" : "ranked down"
          content += `\n\nRank\n${oldRankName} -> ${newRankName} (${rankDirection})`
        }

        if (notificationPlayerId) {
          await sendDiscordDm(notificationPlayerId, content).catch((error) => {
            console.error("Failed to send submission moderation DM:", error)
          })
        }
      }

      const hasExistingThread = Boolean(submission.thread_id)
      const shouldUpdateThread = shouldUpdateSubmissionThread({
        hasExistingThread,
        stateChanged,
        timeChanged,
        noteChanged,
      })

      if (shouldUpdateThread && submission.thread_id) {
        let averageScoreChange: number | undefined
        if (submissionIsWr && wrRow) {
          const oldWr = previousWrRow?.time ?? null
          averageScoreChange = await calculateAverageScoreChangeForWrChange(db, submission.trial_name, oldWr, wrRow.time).catch(() => undefined)
        }

        const previousToShow = previousWrRow?.submission_uuid === uuid ? wrRow : previousWrRow
        const previousWrThreadId = previousToShow?.previous_thread_id ?? undefined
        const updateOldTime = previousPbRow?.time ?? oldPb?.time

        await updateSubmissionThreadContent(submission.thread_id, {
          submission_uuid: updatedSubmission.uuid,
          player_uuid: updatedSubmission.player_uuid,
          player_name: updatedSubmission.player_name,
          trial_name: updatedSubmission.trial_name,
          time: Number(updatedSubmission.time),
          player_score: newPlayerScore,
          oldPlayerScore: playerScoreBefore,
          oldTime: updateOldTime,
          discordUserId: String(oldPlayer?.player_id),
          averageScoreChange,
          is_wr: submissionIsWr,
          previous_wr_submission_uuid: previousToShow?.submission_uuid,
          previous_wr_time: previousToShow?.time,
          previous_wr_player_name: previousToShow?.player_name,
          previous_wr_thread_id: previousWrThreadId,
          new_state: newState,
          moderator_note: updatedSubmission.moderator_note,
        }).catch(() => false)
      }

      const shouldCreateThread = !hasExistingThread && (
        submissionIsWr
        || (newState === "approved" && previousState !== "approved")
      )

      if (scoreRecalculationNeeded) {
        await refreshPlayerPbs(db, submission.player_uuid)
        if (shouldRefreshEveryone) {
          await refreshAllPlayerScores(db, { discordUpdateMode: "all" })
        } else if (wasApproved || isApproved) {
          await refreshPlayerScore(db, submission.player_uuid)
        }
      }

      if (!shouldCreateThread || !wrRow) {
        return
      }

      const oldWr = previousWrRow?.time ?? null
      const averageScoreChange = submissionIsWr
        ? await calculateAverageScoreChangeForWrChange(db, submission.trial_name, oldWr, wrRow.time).catch(() => undefined)
        : undefined

      const approvedRun = {
        submission_uuid: updatedSubmission.uuid,
        player_uuid: updatedSubmission.player_uuid,
        player_name: updatedSubmission.player_name,
        trial_name: updatedSubmission.trial_name,
        time: Number(updatedSubmission.time),
        player_score: newPlayerScore,
        oldPlayerScore: playerScoreBefore,
        oldTime: oldPb?.time,
        discordUserId: String(oldPlayer?.player_id),
        averageScoreChange,
        is_wr: submissionIsWr,
        previous_wr_submission_uuid: previousWrRow?.submission_uuid,
        previous_wr_time: previousWrRow?.time,
        previous_wr_player_name: previousWrRow?.player_name,
        previous_wr_thread_id: previousWrRow?.previous_thread_id ?? undefined,
      }

      const { threadId } = await postApprovedRun(approvedRun)
      if (threadId) {
        await setSubmissionThreadId(db, updatedSubmission.uuid, threadId)
      } else {
        reportMissingApprovedThread(approvedRun)
      }
    } catch (error) {
      console.error("Background submission post-processing failed:", error)
    }
  })())

  return getSubmissionWithScore(env.wasans, uuid)
}

export async function deleteSubmission(
  env: CloudflareEnv,
  ctx: ExecutionContext,
  uuid: string,
  user: AuthUser
) {
  const submission = await getSubmissionDeleteContext(env.wasans, uuid)
  if (!submission) {
    throw new Error("Submission was not found")
  }

  if (submission.player_uuid !== user.uuid && !canModerate(user)) {
    throw new Error("You can only delete your own submissions")
  }

  await insertAuditLog(env.wasans, "submission_deleted", "submission", uuid, {
    actor: user,
    details: {
      trial_name: submission.trial_name,
    },
  })

  if (submission.thread_id) {
    ctx.waitUntil((async () => {
      await deleteBotThread(submission.thread_id as string, submission.uuid).catch(() => null)
    })())
  }

  await deleteSubmissionCascade(env.wasans, uuid)

  if (env.SUBMISSION_VIDEOS) {
    ctx.waitUntil(env.SUBMISSION_VIDEOS.delete(`scores/${uuid}.mp4`))
  }

  const isWr = submission.wr_trial !== null
  const wrTrialName = submission.wr_trial

  ctx.waitUntil((async () => {
    try {
      await refreshPlayerPbs(env.wasans, submission.player_uuid)
      if (isWr && wrTrialName) {
        await refreshWorldRecords(env.wasans, wrTrialName, user)
        // Only refresh all scores if a world record was deleted
        // refreshWorldRecords will handle updating the affected trial
        await refreshAllPlayerScores(env.wasans)
      } else {
        // For non-WR deletions, only refresh the deleting player's score
        await refreshPlayerScore(env.wasans, submission.player_uuid)
      }
    } catch (error) {
      console.error("Background submission delete post-processing failed:", error)
    }
  })())
}
