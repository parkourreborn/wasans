import { jsonError } from "@/lib/server/http"
import { parseAnalyticsRange } from "@/lib/analytics"
import { trials } from "@/lib/trials"
import { getTrialAnalytics } from "@/lib/server/analytics/trial-analytics"
import { enforcePublicReadLimit } from "@/lib/server/services/rate-limit-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

// Public: one trial's deep dive on /analytics (record progression, monthly
// run times, volume, grinders).
export const GET = withV2Params<{ trial: string }>(async (ctx, { trial }) => {
  const limited = await enforcePublicReadLimit(ctx.db, ctx.request, "v2:analytics:trial", {
    actorUuid: ctx.auth?.uuid,
    requestId: ctx.requestId,
  })
  if (limited) return limited

  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const range = parseAnalyticsRange(new URL(ctx.request.url).searchParams.get("range"))
  const key = await cacheKey(ctx.cache, "analytics", "trial", trialName, range)
  const { value } = await readThroughCache(ctx.cache, key, 300, () => getTrialAnalytics(ctx.db, trialName, range))

  return jsonOk(value, { requestId: ctx.requestId })
})
