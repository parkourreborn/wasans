import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { GiveawayError, markGiveawayWinnerClaimed } from "@/lib/server/repositories/giveaway-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { claimed?: unknown } | null
  if (typeof body?.claimed !== "boolean") {
    return validationError("claimed (boolean) is required", ctx.requestId)
  }

  try {
    const winner = await markGiveawayWinnerClaimed(ctx.db, uuid, body.claimed, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "giveaway_winner_claimed", "giveaway_winner", uuid, {
      actor: user,
      details: { claimed: body.claimed },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(winner, { requestId: ctx.requestId })
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
