import { jsonError } from "@/lib/server/http"
import { GiveawayError, joinGiveaway } from "@/lib/server/repositories/giveaway-repository"
import { notifyGiveawayChanged } from "@/lib/server/services/giveaway-notify-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2User, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2User(ctx)

  try {
    const entry = await joinGiveaway(ctx.db, uuid, user.uuid, user.player_name, Math.floor(Date.now() / 1000))

    await bumpCacheGeneration(ctx.cache)
    ctx.ctx.waitUntil(notifyGiveawayChanged(ctx.db, uuid))

    return jsonOk(entry, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof GiveawayError) {
      const status = error.code === "not_found" ? 404 : error.code === "already_entered" ? 409 : 400
      return jsonError(error.message, status, {
        code: error.code === "not_found" ? "not_found" : error.code === "already_entered" ? "conflict" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
