import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { confirmPrizeCandidate, PrizeError } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    const result = await confirmPrizeCandidate(ctx.db, uuid, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "prize_candidate_confirmed", "prize_candidate", uuid, {
      actor: user,
      targetType: "prize",
      targetUuid: result.prize.uuid,
      details: { winner_uuid: result.winner.uuid, player_uuid: result.winner.player_uuid },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(result, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof PrizeError) {
      const status = error.code === "not_found" ? 404 : error.code === "already_full" ? 409 : 400
      return jsonError(error.message, status, {
        code: error.code === "not_found" ? "not_found" : error.code === "already_full" ? "conflict" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
