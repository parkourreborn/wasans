import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError, jsonResponse, parsePagination } from "@/lib/server/http"
import { listPlayers } from "@/lib/server/repositories/player-repository"

const cacheHeaders = {
  "cache-control": "max-age=60, stale-while-revalidate=120",
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const url = new URL(request.url)
  const { limit, offset, page } = parsePagination(url, { page: 1, limit: 50, maxLimit: 200 })
  const search = String(url.searchParams.get("search") || "").trim()

  const data = await listPlayers(env.wasans, {
    limit,
    offset,
    search: search || undefined,
  })

  return jsonResponse(
    {
      results: data.results,
      page,
      limit,
      total: data.total,
    },
    200,
    cacheHeaders
  )
}
