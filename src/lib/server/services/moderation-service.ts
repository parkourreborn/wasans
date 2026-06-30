import "server-only"
import type { AuthUser } from "@/lib/server/auth"
import { canModerate } from "@/lib/server/auth"
import { insertAuditLog } from "@/lib/server/audit"
import type { AuditAction } from "@/lib/server/audit"
import { refreshAllPlayerScores, refreshPlayerScore } from "@/lib/server/player-scores"
import { refreshPlayerPbs } from "@/lib/server/pbs"
import { refreshWorldRecords } from "@/lib/server/wrs"
import {
  deleteBotThread,
  getRankLabel,
  postApprovedRun,
  reportMissingApprovedThread,
  sendDiscordDm,
  updateSubmissionThreadContent,
  updateSubmissionThreadTags,
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

const botModeratorUser: AuthUser = {
  uuid: "discord-bot",
  player_id: "discord-bot",
  player_name: "Discord Bot",
  score: 0,
  permission: 1,
}

export function normalizeState(value: unknown) {
  if (value === "accepted") {
    return "approved"
  }

  if (value === "approved" || value === "denied" || value === "pending") {
    return value
  }

  return null
}

export function normalizeModeratorNote(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const moderatorNote = value.trim().replace(/\s+/g, " ")

  if (moderatorNote.length === 0 || moderatorNote.length > 500) {
    return null
  }

  return moderatorNote
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

export async function resolveModeratorUser(request: Request, env: CloudflareEnv, sessionUser: AuthUser | null, discordId: unknown) {
  const resolvedDiscordId = normalizeDiscordId(discordId)

  if (canModerate(sessionUser)) {
    return sessionUser
  }

  if (!isBotApiRequest(request, env)) {
    return sessionUser
  }

  if (!resolvedDiscordId) {
    return botModeratorUser
  }

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
    return botModeratorUser
  }

  const moderator = await env.wasans.prepare(
    `SELECT players.uuid,
            COALESCE(oauth_accounts.provider_account_id, players.player_id) AS player_id,
            players.player_name,
            players.score,
            players.permission
     FROM players
     LEFT JOIN oauth_accounts
       ON oauth_accounts.player_uuid = players.uuid
       AND oauth_accounts.provider = 'discord'
     WHERE players.uuid = ?
     ORDER BY oauth_accounts.updated_at DESC
     LIMIT 1`
  )
    .bind(account.player_uuid)
    .first<AuthUser>()

  return moderator ?? botModeratorUser
}

async function calculateAverageScoreDeltaForWrChange(
  db: D1Database,
  trialName: string,
  oldWr: number | null,
  newWr: number
) {
  const playerCountRow = await db.prepare(`SELECT COUNT(*) AS count FROM players`).first<{ count: number }>()
  const playerCount = Number(playerCountRow?.count ?? 0)

  if (!playerCount) {
    return 0
  }

  const deltaRow = await db.prepare(
    `SELECT SUM(
       ((? / time) * (? / time) * (? / time))
       - CASE WHEN ? > 0 THEN ((? / time) * (? / time) * (? / time)) ELSE 0 END
     ) AS total_delta
     FROM pbs
     WHERE trial_name = ?`
  )
    .bind(newWr, newWr, newWr, oldWr ?? 0, oldWr ?? 0, oldWr ?? 0, oldWr ?? 0, trialName)
    .first<{ total_delta: number | null }>()

  const totalDelta = Number(deltaRow?.total_delta ?? 0)
  const trialCountRow = await db.prepare(`SELECT COUNT(*) AS count FROM trials`).first<{ count: number }>()
  const trialCount = Number(trialCountRow?.count ?? 1)

  return Number((totalDelta / playerCount / trialCount).toFixed(3))
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
      const previousWrRow = await db.prepare(
        `SELECT w.submission_uuid, w.player_uuid, w.player_name, w.time, w.date, s.thread_id AS previous_thread_id
         FROM wrs w
         LEFT JOIN submissions s ON s.uuid = w.submission_uuid
         WHERE w.trial_name = ?`
      )
        .bind(submission.trial_name)
        .first<{ submission_uuid: string; player_uuid: string; player_name: string; time: number; date: string; previous_thread_id: string | null } | null>()

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

      await refreshPlayerPbs(db, submission.player_uuid)
      await refreshWorldRecords(db, submission.trial_name, user)

      const wrRow = await db.prepare(
        `SELECT w.submission_uuid, w.player_uuid, w.player_name, w.trial_name, w.time, w.date, s.thread_id AS previous_thread_id
         FROM wrs w
         LEFT JOIN submissions s ON s.uuid = w.submission_uuid
         WHERE w.trial_name = ?`
      )
        .bind(submission.trial_name)
        .first<{ submission_uuid: string; player_uuid: string; player_name: string; trial_name: string; time: number; date: string; previous_thread_id: string | null } | null>()

      const wasWr = previousWrRow?.submission_uuid === submission.uuid
      const isCurrentWr = wrRow?.submission_uuid === submission.uuid
      const shouldRefreshEveryone = scoreRecalculationNeeded && (wasWr || isCurrentWr)

      if (scoreRecalculationNeeded) {
        if (shouldRefreshEveryone) {
          await refreshAllPlayerScores(db)
        } else if (wasApproved || isApproved) {
          await refreshPlayerScore(db, submission.player_uuid)
        }
      }

      const updatedSubmission = await getSubmissionWithScore(db, uuid)
      if (!updatedSubmission) {
        return
      }

      const playerScoreBefore = oldPlayer?.score
      const finalModeratorNote = newModeratorNote ?? submission.moderator_note
      const scoreChanged = typeof playerScoreBefore === "number" && Number(updatedSubmission.player_score) !== playerScoreBefore
      const newPlayerScore = Number(updatedSubmission.player_score)
      const oldRankName = typeof playerScoreBefore === "number" ? getRankLabel(playerScoreBefore) : null
      const newRankName = getRankLabel(newPlayerScore)
      const rankChanged = oldRankName !== null && newRankName !== null && oldRankName !== newRankName

      if ((stateChanged || noteChanged || scoreChanged || rankChanged) && oldPlayer?.player_id) {
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

        await sendDiscordDm(oldPlayer.player_id, content).catch((error) => {
          console.error("Failed to send submission moderation DM:", error)
        })
      }

      const submissionIsWr = wrRow?.submission_uuid === uuid
      const hasExistingThread = Boolean(submission.thread_id)
      const shouldUpdateThread = hasExistingThread && (stateChanged || timeChanged || noteChanged)

      if (shouldUpdateThread && submission.thread_id) {
        let averageScoreDelta: number | undefined
        if (submissionIsWr && wrRow) {
          const oldWr = previousWrRow?.time ?? null
          averageScoreDelta = await calculateAverageScoreDeltaForWrChange(db, submission.trial_name, oldWr, wrRow.time).catch(() => undefined)
        }

        await updateSubmissionThreadTags(submission.thread_id, newState, submissionIsWr).catch(() => null)

        const previousToShow = previousWrRow?.submission_uuid === uuid ? wrRow : previousWrRow
        const previousWrThreadId = previousToShow?.previous_thread_id ?? undefined
        const updateOldTime = previousPbRow?.time ?? oldPb?.time

        await updateSubmissionThreadContent(submission.thread_id, {
          submission_uuid: updatedSubmission.uuid,
          player_uuid: updatedSubmission.player_uuid,
          player_name: updatedSubmission.player_name,
          trial_name: updatedSubmission.trial_name,
          time: Number(updatedSubmission.time),
          player_score: Number(updatedSubmission.player_score),
          oldPlayerScore: oldPlayer?.score,
          oldTime: updateOldTime,
          discordUserId: String(oldPlayer?.player_id),
          averageScoreDelta,
          is_wr: submissionIsWr,
          previous_wr_submission_uuid: previousToShow?.submission_uuid,
          previous_wr_time: previousToShow?.time,
          previous_wr_player_name: previousToShow?.player_name,
          previous_wr_thread_id: previousWrThreadId,
          new_state: newState,
          moderator_note: updatedSubmission.moderator_note,
        }).catch(() => null)
      }

      const shouldCreateThread = !hasExistingThread && (
        (submissionIsWr && previousWrRow?.submission_uuid !== uuid)
        || (newState === "approved" && previousState !== "approved" && Number(updatedSubmission.player_score) > 0.3)
      )

      if (!shouldCreateThread || !wrRow) {
        return
      }

      const oldWr = previousWrRow?.time ?? null
      const averageScoreDelta = submissionIsWr
        ? await calculateAverageScoreDeltaForWrChange(db, submission.trial_name, oldWr, wrRow.time).catch(() => undefined)
        : undefined

      const approvedRun = {
        submission_uuid: updatedSubmission.uuid,
        player_uuid: updatedSubmission.player_uuid,
        player_name: updatedSubmission.player_name,
        trial_name: updatedSubmission.trial_name,
        time: Number(updatedSubmission.time),
        player_score: Number(updatedSubmission.player_score),
        oldPlayerScore: oldPlayer?.score,
        oldTime: oldPb?.time,
        discordUserId: String(oldPlayer?.player_id),
        averageScoreDelta,
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
      await deleteBotThread(submission.thread_id as string).catch(() => null)
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
      }
      await refreshAllPlayerScores(env.wasans)
    } catch (error) {
      console.error("Background submission delete post-processing failed:", error)
    }
  })())
}
