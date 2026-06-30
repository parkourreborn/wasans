import { getCloudflareContext } from "@opennextjs/cloudflare"
import { listOverallLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { jsonError, jsonResponse, parsePagination } from "@/lib/server/http"

const cacheHeaders = {
  "cache-control": "max-age=30, stale-while-revalidate=60",
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const url = new URL(request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })
  const leaderboard = await listOverallLeaderboard(env.wasans, limit, offset)

  return jsonResponse({
    results: leaderboard.results,
    page,
    limit,
    total: leaderboard.total,
  }, 200, cacheHeaders)
}
