import { jsonError, validationError } from "@/lib/server/http"
import { isBotApiRequest } from "@/lib/server/bot-auth"
import { GiveawayError, joinGiveaway } from "@/lib/server/repositories/giveaway-repository"
import { notifyGiveawayChanged } from "@/lib/server/services/giveaway-notify-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

// Lets the Discord bot join a giveaway on a player's behalf when they click
// the "Join Giveaway" button on the bot's embed -- a button interaction has
// no wasans session to authenticate with, so this uses the bot API key
// instead (see isBotApiRequest) and takes the player uuid the bot already
// resolved via admin/players/by-discord.
export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isBotApiRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const body = await ctx.request.json().catch(() => null) as { player_uuid?: unknown } | null
  const playerUuid = typeof body?.player_uuid === "string" ? body.player_uuid.trim() : ""
  if (!playerUuid) {
    return validationError("player_uuid is required", ctx.requestId)
  }

  const player = await ctx.db.prepare(`SELECT player_name FROM players WHERE uuid = ?`)
    .bind(playerUuid)
    .first<{ player_name: string }>()

  if (!player) {
    return jsonError("Player not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  try {
    const entry = await joinGiveaway(ctx.db, uuid, playerUuid, player.player_name, Math.floor(Date.now() / 1000))

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
