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
import { rotateRefreshToken } from "@/lib/server/v2/tokens"

export const POST = withV2Context(async (ctx) => {
  // Keyed per-IP, and every client behind carrier NAT or a school/office
  // network shares one bucket — with tabs also refreshing proactively every
  // 10 minutes, a limit sized for a single browser turns into other people's
  // sessions being refused. Kept high enough that only a genuine flood trips
  // it; the client treats a 429 here as retryable rather than as a sign-out.
  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:auth:refresh"), {
    limit: 300,
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

  // Read past the replicas: a player who is still perfectly signed in must
  // never be turned away because a replica hasn't caught up with their row.
  const user = await loadAuthUserByUuid(ctx.db, result.playerUuid, ctx.request, { readFromPrimary: true })
  if (!user) {
    // Deny this refresh, but don't revoke the whole family: both paths that
    // deactivate or delete an account already revoke its tokens at the
    // source, so anything reaching here is an unexplained empty read, and
    // answering it by destroying every session the player has is the kind of
    // collateral damage that is impossible to debug from the outside.
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
