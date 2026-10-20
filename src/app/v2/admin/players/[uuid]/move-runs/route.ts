import { movePlaceholderRuns } from "@/lib/server/services/placeholder-player-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

// Moves a name-only player's runs to the account { player_uuid } once they
// sign up, and deletes the name-only player.
export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)
  const body = ((await ctx.request.json().catch(() => null)) ?? {}) as { player_uuid?: unknown }
  const target = typeof body.player_uuid === "string" ? body.player_uuid : ""
  const result = await movePlaceholderRuns(ctx.env, ctx.db, user, uuid, target)
  await bumpCacheGeneration(ctx.cache)
  return jsonOk(result, { requestId: ctx.requestId })
})
