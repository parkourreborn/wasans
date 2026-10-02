import { parsePagination } from "@/lib/server/http"
import { listPlayers } from "@/lib/server/repositories/player-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const url = new URL(ctx.request.url)
  const { limit, offset, page } = parsePagination(url, { page: 1, limit: 50, maxLimit: 200 })
  const search = String(url.searchParams.get("search") || "").trim()

  const key = await cacheKey(ctx.cache, "players", page, limit, search || "-")
  const { value } = await readThroughCache(ctx.cache, key, 60, () =>
    listPlayers(ctx.db, { limit, offset, search: search || undefined })
  )

  return jsonOk(value.results, {
    meta: { page, limit, total: value.total },
    requestId: ctx.requestId,
  })
})
