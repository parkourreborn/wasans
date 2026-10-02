import { jsonError } from "@/lib/server/http"
import { refreshPlayerPbs } from "@/lib/server/pbs"
import { refreshPlayerScore } from "@/lib/server/player-scores"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const POST = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:auth:me:score", ctx.auth.uuid), {
    limit: 1,
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

  await refreshPlayerPbs(ctx.db, ctx.auth.uuid)
  const score = await refreshPlayerScore(ctx.db, ctx.auth.uuid, { discordUpdateMode: "all" })
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, score }, { requestId: ctx.requestId })
})
