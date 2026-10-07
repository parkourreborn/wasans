import { jsonError, validationError } from "@/lib/server/http"
import { canModerateCombo, loadAuthUserByUuid } from "@/lib/server/auth"
import { isBotApiRequest } from "@/lib/server/bot-auth"
import { listLinkedRobloxAccounts } from "@/lib/server/services/linked-accounts-service"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

// Every Roblox account linked to a player, with current display names (the
// name shown in-game, so the one visible in a submission's video). Private
// to the player, moderators of any tier, and the Discord bot (bot API key),
// since alts are allowed but not everyone wants theirs public.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  if (!isBotApiRequest(ctx.request, ctx.env)) {
    const viewer = ctx.auth ? await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request) : null
    if (!viewer) {
      return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
    }

    if (viewer.uuid !== uuid && !canModerateCombo(viewer)) {
      return jsonError("Moderator permission is required", 403, { code: "forbidden", requestId: ctx.requestId })
    }
  }

  const accounts = await listLinkedRobloxAccounts(ctx.db, ctx.cache, uuid)

  return jsonOk({ accounts }, { requestId: ctx.requestId, headers: { "cache-control": "no-store" } })
})
