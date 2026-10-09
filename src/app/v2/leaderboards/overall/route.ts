import { parsePagination } from "@/lib/server/http"
import { listOverallLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { enforcePublicReadLimit } from "@/lib/server/services/rate-limit-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const limited = await enforcePublicReadLimit(ctx.db, ctx.request, "v2:leaderboards:overall", {
    actorUuid: ctx.auth?.uuid,
    requestId: ctx.requestId,
  })
  if (limited) return limited

  const url = new URL(ctx.request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })

  const key = await cacheKey(ctx.cache, "leaderboards", "overall", page, limit)
  const { value } = await readThroughCache(ctx.cache, key, 60, () => listOverallLeaderboard(ctx.db, limit, offset))

  return jsonOk(value.results, {
    meta: { page, limit, total: value.total },
    requestId: ctx.requestId,
  })
})
