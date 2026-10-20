import { listArchive } from "@/lib/server/services/wr-archive-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Public: every world record's archived original, newest record first. The
// /archive page filters and sorts it in the browser.
export const GET = withV2Context(async (ctx) => {
  const key = await cacheKey(ctx.cache, "archive")
  const { value } = await readThroughCache(ctx.cache, key, 120, () => listArchive(ctx.db))
  return jsonOk(value, { requestId: ctx.requestId })
})
