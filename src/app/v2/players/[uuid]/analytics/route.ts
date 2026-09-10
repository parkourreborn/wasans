import { validationError } from "@/lib/server/http"
import { buildPlayerAnalytics } from "@/lib/server/services/player-analytics-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

// Public: anyone can view anyone's analytics, consistent with scores/ranks
// already being public on this site. See /analytics/private for the
// owner/admin-only extras.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid) && uuid !== "0") {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  const key = await cacheKey(ctx.cache, "player-analytics", uuid)
  const { value } = await readThroughCache(ctx.cache, key, 120, () => buildPlayerAnalytics(ctx.db, uuid))

  if (!value) {
    return jsonOk({ player_found: false }, { requestId: ctx.requestId, status: 404 })
  }

  return jsonOk(value, { requestId: ctx.requestId })
})
