import { getWorldRecordHistoryAll } from "@/lib/server/repositories/records-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const key = await cacheKey(ctx.cache, "records", "world-history-all")
  const { value: results } = await readThroughCache(ctx.cache, key, 60, () => getWorldRecordHistoryAll(ctx.db))

  return jsonOk(results, { requestId: ctx.requestId })
})
