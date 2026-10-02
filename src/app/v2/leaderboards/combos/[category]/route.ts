import { jsonError, parsePagination } from "@/lib/server/http"
import { listComboLeaderboard } from "@/lib/server/repositories/combo-leaderboard-repository"
import { getComboCategory } from "@/lib/server/repositories/combo-category-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ category: string }>(async (ctx, { category }) => {
  const categorySlug = category.trim().toLowerCase()

  const knownCategory = await getComboCategory(ctx.db, categorySlug)
  if (!knownCategory) {
    return jsonError("Unknown combo category", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const url = new URL(ctx.request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 500 })

  const key = await cacheKey(ctx.cache, "leaderboards", "combo", categorySlug, page, limit)
  const { value } = await readThroughCache(ctx.cache, key, 60, () =>
    listComboLeaderboard(ctx.db, categorySlug, limit, offset)
  )

  return jsonOk(
    { results: value.results },
    { meta: { page, limit, total: value.total }, requestId: ctx.requestId }
  )
})
