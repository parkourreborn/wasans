import { jsonError, validationError } from "@/lib/server/http"
import { fetchRobloxHeadshotUrl, isRobloxUserId } from "@/lib/server/roblox"
import { withV2Params } from "@/lib/server/v2/http"

// The headshot of one of the signed-in player's own linked Roblox accounts,
// so Settings can show each one when picking an avatar. Owner-only, unlike
// /v2/players/{uuid}/avatar, since it is addressed by Roblox id.
export const GET = withV2Params<{ robloxId: string }>(async (ctx, { robloxId }) => {
  if (!isRobloxUserId(robloxId)) {
    return validationError("Invalid Roblox user id", ctx.requestId)
  }

  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const linked = await ctx.db.prepare(
    `SELECT 1 AS linked FROM oauth_accounts WHERE provider = 'roblox' AND provider_account_id = ? AND player_uuid = ?`
  )
    .bind(robloxId, ctx.auth.uuid)
    .first<{ linked: number }>()

  const imageUrl = linked ? await fetchRobloxHeadshotUrl(ctx.cache, robloxId) : null
  if (!imageUrl) {
    return jsonError("No headshot", 404, { code: "not_found", requestId: ctx.requestId })
  }

  return new Response(null, { status: 302, headers: { location: imageUrl, "cache-control": "private, max-age=300" } })
})
