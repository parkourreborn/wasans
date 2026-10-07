import { jsonError, validationError } from "@/lib/server/http"
import { fetchRobloxHeadshotUrl } from "@/lib/server/roblox"
import { withV2Params } from "@/lib/server/v2/http"

// A player's avatar: the headshot of the Roblox account they picked, served
// as a redirect to Roblox's CDN. Going through here (rather than handing
// clients the Roblox user id) keeps which Roblox account a player is
// visible only to them and moderators. Listings only point here for players
// whose has_roblox_avatar is set; a 404 falls back to initials client-side.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  const player = await ctx.db.prepare(
    `SELECT avatar_roblox_id FROM players WHERE uuid = ? AND COALESCE(account_status, 'active') = 'active'`
  )
    .bind(uuid)
    .first<{ avatar_roblox_id: string | null }>()

  const imageUrl = player?.avatar_roblox_id ? await fetchRobloxHeadshotUrl(ctx.cache, player.avatar_roblox_id) : null
  if (!imageUrl) {
    return jsonError("No avatar", 404, { code: "not_found", requestId: ctx.requestId, headers: { "cache-control": "public, max-age=300" } })
  }

  // Short enough that picking a different account shows up within minutes.
  return new Response(null, {
    status: 302,
    headers: { location: imageUrl, "cache-control": "public, max-age=300" },
  })
})
