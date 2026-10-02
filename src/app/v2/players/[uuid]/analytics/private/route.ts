import { validationError } from "@/lib/server/http"
import { isOwner } from "@/lib/server/auth"
import { getPlayerByUuid } from "@/lib/server/repositories/player-repository"
import { getPlayerPrivateInsights } from "@/lib/server/analytics/player-insights"
import { buildPlayerAnalytics } from "@/lib/server/services/player-analytics-service"
import { ApiError, jsonOk, requireV2User, withV2Params } from "@/lib/server/v2/http"

// Owner/admin-only extras (next-rank progress, recent score trend, weakest
// trials) -- kept off the public endpoint since it's framed as personal
// advice ("work on this") rather than a public stat.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid) && uuid !== "0") {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  const user = await requireV2User(ctx)
  if (user.uuid !== uuid && !isOwner(user)) {
    throw new ApiError("You can only view your own analytics", 403, "forbidden")
  }

  const player = await getPlayerByUuid(ctx.db, uuid)
  if (!player) {
    return jsonOk({ player_found: false }, { requestId: ctx.requestId, status: 404 })
  }

  const analytics = await buildPlayerAnalytics(ctx.db, uuid)
  const insights = await getPlayerPrivateInsights(ctx.db, uuid, Number(player.score || 0), analytics?.trial_distributions || [])

  return jsonOk({ player_found: true, ...insights }, { requestId: ctx.requestId })
})
