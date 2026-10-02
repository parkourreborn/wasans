import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { closeGiveaway, GiveawayError } from "@/lib/server/repositories/giveaway-repository"
import { notifyGiveawayChanged } from "@/lib/server/services/giveaway-notify-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    const giveaway = await closeGiveaway(ctx.db, uuid, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "giveaway_closed", "giveaway", uuid, { actor: user })
    await bumpCacheGeneration(ctx.cache)
    ctx.ctx.waitUntil(notifyGiveawayChanged(ctx.db, uuid))

    return jsonOk(giveaway, { requestId: ctx.requestId })
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
