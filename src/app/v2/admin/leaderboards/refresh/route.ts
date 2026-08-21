import { refreshAllPlayerScores } from "@/lib/server/player-scores"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"

export const POST = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  await refreshAllPlayerScores(ctx.db)
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ success: true }, { requestId: ctx.requestId })
})
