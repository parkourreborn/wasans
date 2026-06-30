import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError, jsonResponse, validationError } from "@/lib/server/http"
import { querySubmissionByUuid } from "@/lib/server/services/submission-query-service"
import { deleteSubmission, patchSubmission, resolveModeratorUser } from "@/lib/server/services/moderation-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

function isValidSubmissionUuid(uuid: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(uuid)
}

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", requestId)
  }

  const readRate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:submissions:get"), {
    limit: 180,
    windowSeconds: 60,
  })

  if (!readRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: readRate.retryAfter },
      headers: { "retry-after": String(readRate.retryAfter) },
    })
  }

  const data = await querySubmissionByUuid(env.wasans, uuid)
  return jsonResponse(data, 200, { requestId })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const requestId = getRequestId(request)
  const { env, ctx } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", requestId)
  }

  const body = await request.json().catch(() => null) as {
    discordId?: unknown
    state?: unknown
    moderator_note?: unknown
    time?: unknown
  } | null
  if (!body) {
    return validationError("Invalid JSON request body", requestId)
  }

  const sessionUser = await getAuthUser(request, env.wasans)
  const user = await resolveModeratorUser(request, env, sessionUser, body?.discordId)

  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission is required", 403, {
      code: "forbidden",
      requestId,
    })
  }

  const writeRate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:submissions:patch", user.uuid), {
    limit: 60,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: { "retry-after": String(writeRate.retryAfter) },
    })
  }

  try {
    const updated = await patchSubmission({
      env,
      ctx,
      uuid,
      user,
    }, body)

    return jsonResponse({ results: updated ? [updated] : [] }, 200, { requestId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to patch submission"
    const status = message.includes("not found") ? 404 : message.includes("permission") ? 403 : 400
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 403 ? "forbidden" : "validation_error",
      requestId,
    })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const requestId = getRequestId(request)
  const { env, ctx } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", requestId)
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication is required", 401, {
      code: "unauthorized",
      requestId,
    })
  }

  const writeRate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:submissions:delete", user.uuid), {
    limit: 30,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: { "retry-after": String(writeRate.retryAfter) },
    })
  }

  try {
    await deleteSubmission(env, ctx, uuid, user)
    return jsonResponse({ ok: true }, 200, { requestId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete submission"
    const status = message.includes("not found") ? 404 : message.includes("own submissions") ? 403 : 400
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 403 ? "forbidden" : "validation_error",
      requestId,
    })
  }
}
