import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { refreshAllPlayerScores, refreshPlayerScore } from "@/lib/server/player-scores"
import { refreshPlayerPb } from "@/lib/server/pbs"
import { refreshWorldRecords } from "@/lib/server/wrs"
import {
  queueApprovedHighScoreRuns,
  queueWorldRecordRun,
  updateDiscordUsernameOnScoreChange,
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

function normalizeDenyReason(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const denyReason = value.trim().replace(/\s+/g, " ")

  if (denyReason.length === 0 || denyReason.length > 500) {
    return null
  }

  return denyReason
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)

  if (!canModerate(user)) {
    return jsonError("Moderator permission is required", 403)
  }

  const body = await request.json().catch(() => null) as {
    state?: unknown
    deny_reason?: unknown
  } | null
  const state = normalizeState(body?.state)
  const denyReason = state === "denied" ? normalizeDenyReason(body?.deny_reason) : null

  if (!state) {
    return jsonError("State must be pending, denied, or approved")
  }

  if (state === "denied" && !denyReason) {
    return jsonError("Deny reason is required and must be 500 characters or fewer")
  }

  const submission = await env.wasans.prepare(
    `SELECT uuid, player_uuid, trial_name FROM submissions WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow>()

  if (!submission) {
    return jsonError("Submission was not found", 404)
  }

  await env.wasans.prepare(`UPDATE submissions SET state = ?, deny_reason = ? WHERE uuid = ?`)
    .bind(state, denyReason, uuid)
    .run()

  await refreshPlayerPb(env.wasans, submission.player_uuid, submission.trial_name)
  await refreshWorldRecords(env.wasans, submission.trial_name)
  await refreshPlayerScore(env.wasans, submission.player_uuid)
  await updateDiscordUsernameOnScoreChange(submission.player_uuid)

  const { results } = await env.wasans.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.uuid = ?`
  )
    .bind(uuid)
    .all()

  const updatedSubmission = results?.[0]

  if (state === "approved" && updatedSubmission?.player_score > 0.3) {
    await queueApprovedHighScoreRuns([
      {
        submission_uuid: updatedSubmission.uuid,
        player_uuid: updatedSubmission.player_uuid,
        player_name: updatedSubmission.player_name,
        trial_name: updatedSubmission.trial_name,
        time: Number(updatedSubmission.time),
        player_score: Number(updatedSubmission.player_score),
      },
    ])

    const wrRow = await env.wasans.prepare(
      `SELECT submission_uuid, player_uuid, player_name, trial_name, time, date
       FROM wrs
       WHERE trial_name = ?`
    )
      .bind(submission.trial_name)
      .first<{
        submission_uuid: string
        player_uuid: string
        player_name: string
        trial_name: string
        time: number
        date: string
      }>()

    if (wrRow?.submission_uuid === uuid) {
      await queueWorldRecordRun(wrRow)
      await refreshAllPlayerScores(env.wasans)
    }
  }

  return Response.json({ results })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)

  if (!user) {
    return jsonError("Authentication is required", 401)
  }

  const submission = await env.wasans.prepare(
    `SELECT uuid, player_uuid, trial_name FROM submissions WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow>()

  if (!submission) {
    return jsonError("Submission was not found", 404)
  }

  if (submission.player_uuid !== user.uuid && !canModerate(user)) {
    return jsonError("You can only delete your own submissions", 403)
  }

  await env.wasans.prepare(`DELETE FROM wrs WHERE submission_uuid = ?`)
    .bind(uuid)
    .run()
  await env.wasans.prepare(`DELETE FROM submissions WHERE uuid = ?`)
    .bind(uuid)
    .run()

  if (env.SUBMISSION_VIDEOS) {
    await env.SUBMISSION_VIDEOS.delete(`scores/${uuid}.mp4`)
  }

  await refreshWorldRecords(env.wasans, submission.trial_name)
  await refreshPlayerScore(env.wasans, submission.player_uuid)
  await refreshAllPlayerScores(env.wasans)

  return Response.json({ ok: true })
}
