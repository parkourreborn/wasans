import { getCloudflareContext } from "@opennextjs/cloudflare"
import { listTrialLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { getRequestId, jsonError, jsonResponse, parsePagination } from "@/lib/server/http"
import { trials } from "@/lib/trials"

const cacheHeaders = {
  "cache-control": "max-age=30, stale-while-revalidate=60",
}

export async function GET(request: Request, { params }: { params: Promise<{ trial: string }> }) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })
  const { trial } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId })
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
  }, 200, { headers: cacheHeaders, requestId })
}
