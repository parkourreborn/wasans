import { loadAuthUserByUuid } from "@/lib/server/auth"
import { jsonError } from "@/lib/server/http"
import { deactivateAccount } from "@/lib/server/services/account-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { expiredV2AuthCookies, jsonOk, withV2Context } from "@/lib/server/v2/http"
import { revokeAllRefreshTokensForPlayer } from "@/lib/server/v2/tokens"

export const POST = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:deactivate", user.uuid), {
    limit: 5,
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

  await deactivateAccount(ctx.db, user)
  await revokeAllRefreshTokensForPlayer(ctx.db, user.uuid)
  await bumpCacheGeneration(ctx.cache)

  const headers = new Headers()
  for (const cookie of expiredV2AuthCookies(ctx.request)) {
    headers.append("set-cookie", cookie)
  }

  return jsonOk({ ok: true }, { requestId: ctx.requestId, headers })
})
