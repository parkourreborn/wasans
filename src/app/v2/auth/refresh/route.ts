import { jsonError } from "@/lib/server/http"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import {
  buildAccessCookie,
  buildRefreshCookie,
  expiredV2AuthCookies,
  getJwtSecret,
  getRefreshCookieValue,
  issueAccessToken,
  jsonOk,
  withV2Context,
} from "@/lib/server/v2/http"
import { revokeAllRefreshTokensForPlayer, rotateRefreshToken } from "@/lib/server/v2/tokens"

export const POST = withV2Context(async (ctx) => {
  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:auth:refresh"), {
    limit: 30,
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

  const presented = getRefreshCookieValue(ctx.request)
  if (!presented) {
    return jsonError("Missing refresh token", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const result = await rotateRefreshToken(ctx.db, presented)

  if (result.status !== "ok") {
    const headers = new Headers()
    for (const cookie of expiredV2AuthCookies(ctx.request)) {
      headers.append("set-cookie", cookie)
    }
    return jsonError("Refresh token invalid", 401, { code: "unauthorized", requestId: ctx.requestId, headers })
  }

  const user = await loadAuthUserByUuid(ctx.db, result.playerUuid, ctx.request)
  if (!user) {
    await revokeAllRefreshTokensForPlayer(ctx.db, result.playerUuid)
    const headers = new Headers()
    for (const cookie of expiredV2AuthCookies(ctx.request)) {
      headers.append("set-cookie", cookie)
    }
    return jsonError("Account not available", 401, { code: "unauthorized", requestId: ctx.requestId, headers })
  }

  const secret = getJwtSecret(ctx.env)
  const accessToken = await issueAccessToken(user.uuid, user.permission, secret)

  const headers = new Headers()
  headers.append("set-cookie", buildAccessCookie(ctx.request, accessToken))
  headers.append("set-cookie", buildRefreshCookie(ctx.request, result.issued.refreshToken, result.issued.expiresAt))

  return jsonOk({ user }, { requestId: ctx.requestId, headers })
})
