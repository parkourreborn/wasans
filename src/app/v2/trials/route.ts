import { listPublicTrialOrder } from "@/lib/server/repositories/trial-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Public, unauthenticated: the admin-configurable display order that the
// calculator, compare, WRs, and submissions/trials pages all sort by.
export const GET = withV2Context(async (ctx) => {
  const key = await cacheKey(ctx.cache, "trials", "order")
  const { value } = await readThroughCache(ctx.cache, key, 60, () => listPublicTrialOrder(ctx.db))

  return jsonOk(value, { requestId: ctx.requestId })
})
