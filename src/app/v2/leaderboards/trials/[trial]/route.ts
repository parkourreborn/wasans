import { jsonError, parsePagination } from "@/lib/server/http"
import { listTrialLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { trials } from "@/lib/trials"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context<{ trial: string }>(async (ctx, { trial }) => {
  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const url = new URL(ctx.request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })

  const key = await cacheKey(ctx.cache, "leaderboards", "trial", trialName, page, limit)
  const { value } = await readThroughCache(ctx.cache, key, 60, () =>
    listTrialLeaderboard(ctx.db, trialName, limit, offset)
  )

  return jsonOk(
    { wr: value.wr, results: value.results },
    { meta: { page, limit, total: value.total }, requestId: ctx.requestId }
  )
})
