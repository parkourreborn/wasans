import { validationError } from "@/lib/server/http"
import { isOwner } from "@/lib/server/auth"
import { getPlayerGains } from "@/lib/server/analytics/player-gains"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2User, withV2Params } from "@/lib/server/v2/http"

// "Biggest gains" for the profile: private to the player (and owners), since
// it's advice about where they're behind rather than a public stat.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  const user = await requireV2User(ctx)
  if (user.uuid !== uuid && !isOwner(user)) {
    throw new ApiError("You can only see your own gains", 403, "forbidden")
  }

  const key = await cacheKey(ctx.cache, "player-gains", uuid)
  const { value } = await readThroughCache(ctx.cache, key, 300, () => getPlayerGains(ctx.db, uuid))
  if (!value) {
    throw new ApiError("Player was not found", 404, "not_found")
  }

  return jsonOk(value, { requestId: ctx.requestId, headers: { "cache-control": "no-store" } })
})
