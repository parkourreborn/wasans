import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { refreshWorldRecords } from "@/lib/server/wrs"

export async function GET(_: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(`SELECT * FROM submissions WHERE uuid = ?`)
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

  const body = await request.json().catch(() => null) as { state?: unknown } | null
  const state = normalizeState(body?.state)

  if (!state) {
    return jsonError("State must be pending, denied, or approved")
  }

  const submission = await env.wasans.prepare(
    `SELECT uuid, player_uuid, trial_name FROM submissions WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow>()

  if (!submission) {
    return jsonError("Submission was not found", 404)
  }

  await env.wasans.prepare(`UPDATE submissions SET state = ? WHERE uuid = ?`)
    .bind(state, uuid)
    .run()

  await refreshWorldRecords(env.wasans, submission.trial_name)

  const { results } = await env.wasans.prepare(`SELECT * FROM submissions WHERE uuid = ?`)
    .bind(uuid)
    .run()

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
  await refreshWorldRecords(env.wasans, submission.trial_name)

  return Response.json({ ok: true })
}
