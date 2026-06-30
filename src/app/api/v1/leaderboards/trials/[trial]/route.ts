import { getCloudflareContext } from "@opennextjs/cloudflare"
import { listTrialLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { jsonError, jsonResponse, parsePagination } from "@/lib/server/http"
import { trials } from "@/lib/trials"

const cacheHeaders = {
  "cache-control": "max-age=30, stale-while-revalidate=60",
}

export async function GET(request: Request, { params }: { params: Promise<{ trial: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { trial } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400)
  }

  const url = new URL(request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })
  const leaderboard = await listTrialLeaderboard(env.wasans, trialName, limit, offset)

  return jsonResponse({
    wr: leaderboard.wr,
    results: leaderboard.results,
    page,
    limit,
    total: leaderboard.total,
  }, 200, cacheHeaders)
}
