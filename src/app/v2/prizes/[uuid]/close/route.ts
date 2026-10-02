import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { closePrize, PrizeError } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    const prize = await closePrize(ctx.db, uuid, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "prize_closed", "prize", uuid, { actor: user })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(prize, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof PrizeError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
