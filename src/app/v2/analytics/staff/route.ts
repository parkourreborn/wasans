import { parseAnalyticsRange } from "@/lib/analytics"
import { getStaffAnalytics } from "@/lib/server/analytics/staff-analytics"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

// Moderators and up: the staff half of /analytics (moderation, video
// pipeline, accounts). Checked before the cache is read, so the cached
// entry is never served to anyone else.
export const GET = withV2Context(async (ctx) => {
  await requireV2Moderator(ctx)

  const range = parseAnalyticsRange(new URL(ctx.request.url).searchParams.get("range"))
  const key = await cacheKey(ctx.cache, "analytics", "staff", range)
  const { value } = await readThroughCache(ctx.cache, key, 120, () => getStaffAnalytics(ctx.db, range))

  return jsonOk(value, { requestId: ctx.requestId })
})
