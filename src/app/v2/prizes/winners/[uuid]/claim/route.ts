import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { markPrizeWinnerClaimed, PrizeError } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { claimed?: unknown } | null
  if (typeof body?.claimed !== "boolean") {
    return validationError("claimed (boolean) is required", ctx.requestId)
  }

  try {
    const winner = await markPrizeWinnerClaimed(ctx.db, uuid, body.claimed, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "prize_winner_claimed", "prize_winner", uuid, {
      actor: user,
      details: { claimed: body.claimed },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(winner, { requestId: ctx.requestId })
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
