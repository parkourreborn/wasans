import { jsonError, parsePagination } from "@/lib/server/http"
import { getTrialLeaderboardEntry, listTrialLeaderboard } from "@/lib/server/repositories/leaderboard-repository"
import { trials } from "@/lib/trials"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ trial: string }>(async (ctx, { trial }) => {
  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const url = new URL(ctx.request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })
  const playerUuid = String(url.searchParams.get("player") || "").trim()
  if (playerUuid && !/^[A-Za-z0-9_-]{6,64}$/.test(playerUuid)) {
    return jsonError("Invalid player uuid", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const key = await cacheKey(ctx.cache, "leaderboards", "trial", trialName, page, limit)
  const { value } = await readThroughCache(ctx.cache, key, 60, () =>
    listTrialLeaderboard(ctx.db, trialName, limit, offset)
  )

  // The page itself is shared and cached; one player's own standing is a
  // single indexed lookup, kept out of KV so it doesn't add a cache entry
  // per player.
  const player = playerUuid ? await getTrialLeaderboardEntry(ctx.db, trialName, playerUuid) : undefined

  return jsonOk(
    { wr: value.wr, results: value.results, ...(playerUuid ? { player } : {}) },
    { meta: { page, limit, total: value.total }, requestId: ctx.requestId }
  )
})
