import { parsePagination } from "@/lib/server/http"
import { listPlayers } from "@/lib/server/repositories/player-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const url = new URL(ctx.request.url)
  const { limit, offset, page } = parsePagination(url, { page: 1, limit: 50, maxLimit: 200 })
  const search = String(url.searchParams.get("search") || "").trim()

  // Searches skip the KV cache: search-as-you-type sends a new term on most
  // keystrokes, so caching them would be a KV write each for entries that
  // are rarely read twice. The query itself is cheap.
  const value = search
    ? await listPlayers(ctx.db, { limit, offset, search })
    : (
        await readThroughCache(ctx.cache, await cacheKey(ctx.cache, "players", page, limit, "-"), 60, () =>
          listPlayers(ctx.db, { limit, offset })
        )
      ).value

  return jsonOk(value.results, {
    meta: { page, limit, total: value.total },
    requestId: ctx.requestId,
  })
})
