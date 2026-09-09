import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { GiveawayError, rerollGiveawayWinners } from "@/lib/server/repositories/giveaway-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    const winners = await rerollGiveawayWinners(ctx.db, uuid, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "giveaway_rerolled", "giveaway", uuid, {
      actor: user,
      details: { winner_count: winners.length },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(winners, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof GiveawayError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
