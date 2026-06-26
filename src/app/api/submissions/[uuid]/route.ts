import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import type { AuthUser } from "@/lib/server/auth"
import { refreshAllPlayerScores, refreshPlayerScore } from "@/lib/server/player-scores"
import { refreshPlayerPbs } from "@/lib/server/pbs"
import { refreshWorldRecords } from "@/lib/server/wrs"
import { insertAuditLog } from "@/lib/server/audit"
import type { AuditAction } from "@/lib/server/audit"
import {
  deleteBotThread,
  getRankLabel,
  reportMissingApprovedThread,
  sendDiscordDm,
  updateSubmissionThreadTags,
  updateSubmissionThreadContent,
} from "@/lib/server/notifications"

export async function GET(_: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.uuid = ?`
  )
    .bind(uuid)
    .run()

  return Response.json({ results })

}

type SubmissionRow = {
  uuid: string
  player_uuid: string
  trial_name: string
  state: string
  time: number
  moderator_note: string | null
  moderator_username: string | null
  thread_id: string | null
}

type SubmissionWithScoreRow = SubmissionRow & {
  player_name: string
  player_score: number | string
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function normalizeState(value: unknown) {
  if (value === "accepted") {
    return "approved"
  }

  if (value === "approved" || value === "denied" || value === "pending") {
    return value
  }

  return null
}

function normalizeModeratorNote(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const moderatorNote = value.trim().replace(/\s+/g, " ")

  if (moderatorNote.length === 0 || moderatorNote.length > 500) {
    return null
  }

  return moderatorNote
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
    .bind(
      newWr,
      newWr,
      newWr,
      oldWr ?? 0,
      oldWr ?? 0,
      oldWr ?? 0,
      oldWr ?? 0,
      trialName
    )
    .first<{ total_delta: number | null }>()

  const totalDelta = Number(deltaRow?.total_delta ?? 0)
  const trialCountRow = await db.prepare(`SELECT COUNT(*) AS count FROM trials`).first<{ count: number }>()
  const trialCount = Number(trialCountRow?.count ?? 1)

  return Number((totalDelta / playerCount / trialCount).toFixed(3))
}

async function scheduleSubmissionPostProcessing(
  ctx: ExecutionContext,
  env: CloudflareEnv,
  submission: SubmissionRow,
  state: string | null,
  previousState: string,
  user: AuthUser,
  oldPlayer: { score: number; player_id: string } | null,
  oldPb: { time: number } | null,
  uuid: string,
  stateChanged: boolean,
  timeChanged: boolean,
  noteChanged: boolean,
  previousModeratorNote: string | null,
  newModeratorNote: string | null
) {
  ctx.waitUntil((async () => {
    try {
      const db = env.wasans as D1Database
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
            .first() as { time: number } | undefined
        : null

      const newState = state ?? previousState
      const wasApproved = previousState === "approved"
      const isApproved = newState === "approved"
      const scoreRecalculationNeeded = (stateChanged || timeChanged) && (wasApproved || isApproved)

      await refreshPlayerPbs(env.wasans, submission.player_uuid)
      await refreshWorldRecords(env.wasans, submission.trial_name, user)

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
          await refreshAllPlayerScores(env.wasans)
        } else if (wasApproved || isApproved) {
          await refreshPlayerScore(env.wasans, submission.player_uuid)
        }
      }

      const { results } = await db.prepare(
        `SELECT submissions.*, players.score as player_score
         FROM submissions
         LEFT JOIN players ON players.uuid = submissions.player_uuid
         WHERE submissions.uuid = ?`
      )
        .bind(uuid)
        .all()

      const updatedSubmission = results?.[0] as SubmissionWithScoreRow | undefined
      if (!updatedSubmission) {
        return
      }


      const playerScoreBefore = oldPlayer?.score
      const finalModeratorNote = newModeratorNote ?? previousModeratorNote
      const scoreChanged = typeof playerScoreBefore === "number" && Number(updatedSubmission?.player_score) !== playerScoreBefore
      const newPlayerScore = Number(updatedSubmission?.player_score)
      const oldRankName = typeof playerScoreBefore === "number" ? getRankLabel(playerScoreBefore) : null
      const newRankName = getRankLabel(newPlayerScore)
      const rankChanged = oldRankName !== null && newRankName !== null && oldRankName !== newRankName

      if ((stateChanged || noteChanged || scoreChanged || rankChanged) && oldPlayer?.player_id) {
        const displayState = (value: string) => {
          if (value === "approved") return "Accepted"
          if (value === "denied") return "Denied"
          return "Pending"
        }

        let content = `Your submission https://wasans.tully.sh/submissions/${uuid} has been moderated by ${user.player_name}`

        if (stateChanged) {
          content += `\n\nState\n${displayState(previousState)} -> ${displayState(newState)}`
        }

        if (noteChanged) {
          const oldNote = previousModeratorNote ?? "N/A"
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

        ctx.waitUntil((async () => {
          try {
            await sendDiscordDm(oldPlayer.player_id, content)
          } catch (error) {
            console.error("Failed to send submission moderation DM:", error)
          }
        })())
      }

      const submissionIsWr = wrRow?.submission_uuid === uuid
      const hasExistingThread = Boolean(submission.thread_id)
      const shouldUpdateThread = hasExistingThread && (stateChanged || timeChanged)

      // If there's already a thread and the submission changed state or time, update the tags/content
      if (shouldUpdateThread) {
        if (submission.thread_id) {
          // compute averageScoreDelta if this is a WR so we can include it in the updated content
          let averageScoreDelta: number | undefined
          if (submissionIsWr) {
            try {
              const oldWr = previousWrRow?.time ?? null
              averageScoreDelta = await calculateAverageScoreDeltaForWrChange(env.wasans, submission.trial_name, oldWr, wrRow!.time)
            } catch (err) {
              console.error("Failed to calculate average score delta:", err)
            }
          }

          ctx.waitUntil((async () => {
            try {
              await updateSubmissionThreadTags(submission.thread_id as string, newState, submissionIsWr)
            } catch (error) {
              console.error("Failed to update submission thread tags:", error)
            }

            try {
              const previousToShow = previousWrRow?.submission_uuid === uuid ? wrRow : previousWrRow
              const previousWrThreadId = previousToShow?.previous_thread_id ?? undefined
              const updateOldTime = previousPbRow?.time ?? oldPb?.time

              await updateSubmissionThreadContent(submission.thread_id as string, {
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
              })
            } catch (error) {
              console.error("Failed to update submission thread content:", error)
            }
          })())
        }
      }

      // Only create a new thread if one doesn't exist already
      const shouldCreateThread = !hasExistingThread &&
        ((submissionIsWr && previousWrRow?.submission_uuid !== uuid) || // New WR
        (state === "approved" && state !== previousState && Number(updatedSubmission?.player_score) > 0.3)) // New approval

      if (!shouldCreateThread) {
        return
      }

      let averageScoreDelta: number | undefined
      if (submissionIsWr) {
        const oldWr = previousWrRow?.time ?? null
        averageScoreDelta = await calculateAverageScoreDeltaForWrChange(env.wasans, submission.trial_name, oldWr, wrRow!.time)
      }

      // When creating a new thread for an approved run, include previous WR metadata if available
      const previousWrThreadId = previousWrRow?.previous_thread_id ?? undefined

      reportMissingApprovedThread({
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
        previous_wr_thread_id: previousWrThreadId,
      })
    } catch (error) {
      console.error("Background submission post-processing failed:", error)
    }
  })())
}

async function scheduleSubmissionDeletePostProcessing(
  ctx: ExecutionContext,
  env: CloudflareEnv,
  submission: SubmissionRow,
  isWr: boolean,
  wrTrialName: string | null,
  user: AuthUser
) {
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

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env, ctx } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)

  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission is required", 403)
  }

  const body = await request.json().catch(() => null) as {
    state?: unknown
    moderator_note?: unknown
    time?: unknown
  } | null
  const state = normalizeState(body?.state)
  const moderatorNote = normalizeModeratorNote(body?.moderator_note)
  const rawTime = body?.time
  const time = typeof rawTime === "string" && /^[0-9]+(\.[0-9]{1,3})?$/.test(rawTime.trim())
    ? Number(rawTime.trim())
    : typeof rawTime === "number" && Number.isFinite(rawTime)
    ? rawTime
    : null

  if (!state && time === null && moderatorNote === null) {
    return jsonError("State, time, or moderator note must be provided")
  }

  if (time !== null && time <= 0) {
    return jsonError("Time must be a positive number")
  }

  const submission = await env.wasans.prepare(
    `SELECT uuid, player_uuid, trial_name, state, time, moderator_note, thread_id
     FROM submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow>()

  if (!submission) {
    return jsonError("Submission was not found", 404)
  }

  const previousState = normalizeState(submission.state) || submission.state

  const updates = [] as string[]
  const bindings = [] as Array<string | number | null>

  if (state) {
    updates.push("state = ?")
    bindings.push(state)
  }

  if (moderatorNote !== null) {
    updates.push("moderator_note = ?")
    bindings.push(moderatorNote)
  }

  if (time !== null) {
    updates.push("time = ?")
    bindings.push(time)
  }

  // Always update moderator_username when a moderator makes changes
  if (updates.length > 0 && user) {
    updates.push("moderator_username = ?")
    bindings.push(user.player_name)
  }

  if (updates.length > 0) {
    await env.wasans.prepare(`UPDATE submissions SET ${updates.join(", ")} WHERE uuid = ?`)
      .bind(...bindings, uuid)
      .run()
  }

  const auditDetails: Record<string, unknown> = {
    trial_name: submission.trial_name,
  }
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
    if (!state || state === previousState) {
      auditAction = "submission_updated"
    }
  }

  await insertAuditLog(env.wasans, auditAction, "submission", uuid, {
    actor: user,
    details: auditDetails,
  })

  // Note: do not delete threads when a submission is moved back to "pending".
  // Threads are only deleted when the submission itself is removed (handled in DELETE).

  const oldPlayer = await env.wasans.prepare(
    `SELECT score, player_id FROM players WHERE players.uuid = ?`
  )
    .bind(submission.player_uuid)
    .first<{ score: number, player_id: string }>()

  const oldPb = await env.wasans.prepare(
    `SELECT time FROM pbs WHERE player_uuid = ? AND trial_name = ?`
  )
    .bind(submission.player_uuid, submission.trial_name)
    .first<{ time: number }>()

  const newModeratorNote = moderatorNote !== null ? moderatorNote : submission.moderator_note
  const noteChanged = submission.moderator_note !== newModeratorNote
  const stateChanged = state !== null && state !== previousState
  const timeChanged = time !== null && time !== submission.time

  scheduleSubmissionPostProcessing(
    ctx,
    env,
    submission,
    state,
    previousState,
    user,
    oldPlayer,
    oldPb,
    uuid,
    stateChanged,
    timeChanged,
    noteChanged,
    submission.moderator_note,
    newModeratorNote
  )

  const { results } = await env.wasans.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.uuid = ?`
  )
    .bind(uuid)
    .all<SubmissionWithScoreRow>()

  return Response.json({ results })
}

type SubmissionDeleteRow = SubmissionRow & {
  wr_trial: string | null
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env, ctx } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)

  if (!user) {
    return jsonError("Authentication is required", 401)
  }

  const submission = await env.wasans.prepare(
    `SELECT s.uuid, s.player_uuid, s.trial_name, s.thread_id, w.trial_name AS wr_trial
     FROM submissions s
     LEFT JOIN wrs w ON w.submission_uuid = s.uuid
     WHERE s.uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionDeleteRow>()

  if (!submission) {
    return jsonError("Submission was not found", 404)
  }

  if (submission.player_uuid !== user.uuid && !canModerate(user)) {
    return jsonError("You can only delete your own submissions", 403)
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

  const session = env.wasans.withSession('first-primary')
  await session.batch([
    session.prepare(`DELETE FROM wrs WHERE submission_uuid = ?`).bind(uuid),
    session.prepare(`DELETE FROM pbs WHERE submission_uuid = ?`).bind(uuid),
    session.prepare(`DELETE FROM submissions WHERE uuid = ?`).bind(uuid),
  ])

  if (env.SUBMISSION_VIDEOS) {
    ctx.waitUntil(env.SUBMISSION_VIDEOS.delete(`scores/${uuid}.mp4`))
  }

  const isWr = submission.wr_trial !== null
  const wrTrialName = submission.wr_trial

  scheduleSubmissionDeletePostProcessing(ctx, env, submission, isWr, wrTrialName, user)

  return Response.json({ ok: true })
}
