import { jsonError } from "@/lib/server/http"
import { getPrize, listPrizeWinners } from "@/lib/server/repositories/prize-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const key = await cacheKey(ctx.cache, "prize", uuid)
  const { value } = await readThroughCache(ctx.cache, key, 60, async () => {
    const prize = await getPrize(ctx.db, uuid)
    if (!prize) {
      return null
    }
    const winners = await listPrizeWinners(ctx.db, uuid)
    return { prize, winners }
  })

  if (!value) {
    return jsonError(`Prize "${uuid}" was not found`, 404, { code: "not_found", requestId: ctx.requestId })
  }

  return jsonOk(value, { requestId: ctx.requestId })
})
