import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { PrizeError, removePrizeWinner } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const DELETE = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    const prize = await removePrizeWinner(ctx.db, uuid)

    await insertAuditLog(ctx.db, "prize_winner_removed", "prize_winner", uuid, {
      actor: user,
      targetType: "prize",
      targetUuid: prize.uuid,
    })
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
