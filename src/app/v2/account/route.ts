import { accountDeletePhrase } from "@/lib/account-deletion"
import { validatePlayerName } from "@/lib/player-name"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { jsonError, validationError } from "@/lib/server/http"
import { isPlayerNameTaken } from "@/lib/server/player-name-service"
import { changePlayerName, deleteAccount } from "@/lib/server/services/account-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { expiredV2AuthCookies, jsonOk, withV2Context } from "@/lib/server/v2/http"
import { revokeAllRefreshTokensForPlayer } from "@/lib/server/v2/tokens"

export const PATCH = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const body = await ctx.request.json().catch(() => null) as { player_name?: unknown } | null
  if (!body) {
    return validationError("Invalid JSON request body", ctx.requestId)
  }

  const name = validatePlayerName(body.player_name)
  if (!name.ok) {
    return validationError(name.message, ctx.requestId)
  }

  if (name.playerName === user.player_name) {
    return jsonOk({ ok: true, user }, { requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:username", user.uuid), {
    limit: 1,
    windowSeconds: 60 * 60,
  })

  if (!rate.allowed) {
    return jsonError("Username changes are limited. Try again later.", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  if (await isPlayerNameTaken(ctx.db, name.playerName, user.uuid)) {
    return jsonError("That username is taken.", 409, { code: "conflict", requestId: ctx.requestId })
  }

  await changePlayerName(ctx.db, user.player_name, name.playerName)
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, user: { ...user, player_name: name.playerName } }, { requestId: ctx.requestId })
})

export const DELETE = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:delete", user.uuid), {
    limit: 3,
    windowSeconds: 60,
  })

  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  const body = await ctx.request.json().catch(() => null) as { confirmation?: unknown } | null
  if (!body || body.confirmation !== accountDeletePhrase) {
    return validationError(`Type ${accountDeletePhrase} to confirm account deletion`, ctx.requestId)
  }

  await deleteAccount(ctx.db, user)
  await revokeAllRefreshTokensForPlayer(ctx.db, user.uuid)
  await bumpCacheGeneration(ctx.cache)

  const headers = new Headers()
  for (const cookie of expiredV2AuthCookies(ctx.request)) {
    headers.append("set-cookie", cookie)
  }

  return jsonOk({ ok: true }, { requestId: ctx.requestId, headers })
})
