import { getCloudflareContext } from "@opennextjs/cloudflare"
import { accountDeletePhrase } from "@/lib/account-deletion"
import { validatePlayerName } from "@/lib/player-name"
import { getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError, jsonResponse, validationError } from "@/lib/server/http"
import { isPlayerNameTaken } from "@/lib/server/player-name-service"
import { appendExpiredAuthCookies, changePlayerName, deleteAccount } from "@/lib/server/services/account-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function PATCH(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId })
  }

  const body = await request.json().catch(() => null) as { player_name?: unknown } | null
  if (!body) {
    return validationError("Invalid JSON request body", requestId)
  }

  const name = validatePlayerName(body.player_name)
  if (!name.ok) {
    return validationError(name.message, requestId)
  }

  if (name.playerName === user.player_name) {
    return jsonResponse({ ok: true, user }, 200, { requestId })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:account:username", user.uuid), {
    limit: 1,
    windowSeconds: 60 * 60,
  })

  if (!rate.allowed) {
    return jsonError("Username changes are limited. Try again later.", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  if (await isPlayerNameTaken(env.wasans, name.playerName, user.uuid)) {
    return jsonError("That username is taken.", 409, { code: "conflict", requestId })
  }

  await changePlayerName(env.wasans, user.player_name, name.playerName)

  return jsonResponse({
    ok: true,
    user: {
      ...user,
      player_name: name.playerName,
    },
  }, 200, { requestId })
}

export async function DELETE(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:account:delete", user.uuid), {
    limit: 3,
    windowSeconds: 60,
  })

  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null
  if (!body || body.confirmation !== accountDeletePhrase) {
    return validationError(`Type ${accountDeletePhrase} to confirm account deletion`, requestId)
  }

  await deleteAccount(env.wasans, user)

  const headers = new Headers({ "content-type": "application/json" })
  headers.set("x-request-id", requestId)
  appendExpiredAuthCookies(headers, request)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
