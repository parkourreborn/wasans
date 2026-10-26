import { parseAnalyticsRange } from "@/lib/analytics"
import { getPublicAnalytics } from "@/lib/server/analytics/site-analytics"
import { enforcePublicReadLimit } from "@/lib/server/services/rate-limit-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Public: the /analytics page's trial distributions, cross-trial stats,
// activity and player stats. One cache entry per range.
export const GET = withV2Context(async (ctx) => {
  const limited = await enforcePublicReadLimit(ctx.db, ctx.request, "v2:analytics", {
    actorUuid: ctx.auth?.uuid,
    requestId: ctx.requestId,
  })
  if (limited) return limited

  const range = parseAnalyticsRange(new URL(ctx.request.url).searchParams.get("range"))
  const key = await cacheKey(ctx.cache, "analytics", range)
  const { value } = await readThroughCache(ctx.cache, key, 300, () => getPublicAnalytics(ctx.db, range))

  return jsonOk(value, { requestId: ctx.requestId })
})
