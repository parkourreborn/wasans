import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { getPlayerByUuid } from "@/lib/server/repositories/player-repository"
import { addManualPrizeWinner, PrizeError } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { player_uuid?: unknown } | null
  const playerUuid = typeof body?.player_uuid === "string" ? body.player_uuid : ""
  if (!playerUuid) {
    return validationError("player_uuid is required", ctx.requestId)
  }

  const player = await getPlayerByUuid(ctx.db, playerUuid)
  if (!player) {
    return jsonError(`Player "${playerUuid}" was not found`, 404, { code: "not_found", requestId: ctx.requestId })
  }

  try {
    const winner = await addManualPrizeWinner(ctx.db, uuid, playerUuid, player.player_name, user, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "prize_winner_added", "prize", uuid, {
      actor: user,
      targetType: "player",
      targetUuid: playerUuid,
      details: { winner_uuid: winner.uuid, source: "manual" },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(winner, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof PrizeError) {
      const conflict = error.code === "already_full" || error.code === "already_won"
      const status = error.code === "not_found" ? 404 : conflict ? 409 : 400
      return jsonError(error.message, status, {
        code: error.code === "not_found" ? "not_found" : conflict ? "conflict" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
