import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { jsonError, jsonResponse } from "@/lib/server/http"
import { querySubmissionByUuid } from "@/lib/server/services/submission-query-service"
import { deleteSubmission, patchSubmission, resolveModeratorUser } from "@/lib/server/services/moderation-service"

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const data = await querySubmissionByUuid(env.wasans, uuid)
  return jsonResponse(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env, ctx } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const body = await request.json().catch(() => null) as {
    discordId?: unknown
    state?: unknown
    moderator_note?: unknown
    time?: unknown
  } | null
  const sessionUser = await getAuthUser(request, env.wasans)
  const user = await resolveModeratorUser(request, env, sessionUser, body?.discordId)

  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission is required", 403)
  }

  try {
    const updated = await patchSubmission({
      env,
      ctx,
      uuid,
      user,
    }, body)

    return jsonResponse({ results: updated ? [updated] : [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to patch submission"
    const status = message.includes("not found") ? 404 : message.includes("permission") ? 403 : 400
    return jsonError(message, status)
  }
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

  try {
    await deleteSubmission(env, ctx, uuid, user)
    return jsonResponse({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete submission"
    const status = message.includes("not found") ? 404 : message.includes("own submissions") ? 403 : 400
    return jsonError(message, status)
  }
}
