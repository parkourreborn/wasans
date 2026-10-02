import { jsonError } from "@/lib/server/http"
import { getWorldRecordHistory } from "@/lib/server/repositories/records-repository"
import { trials } from "@/lib/trials"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ trial: string }>(async (ctx, { trial }) => {
  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const key = await cacheKey(ctx.cache, "records", "world-history", trialName)
  const { value: results } = await readThroughCache(ctx.cache, key, 60, () =>
    getWorldRecordHistory(ctx.db, trialName)
  )

  return jsonOk(results, { requestId: ctx.requestId })
})
