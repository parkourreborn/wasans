import { jsonError, validationError } from "@/lib/server/http"
import { isBotApiRequest } from "@/lib/server/bot-auth"
import { jsonOk, requireV2Moderator, withV2Params } from "@/lib/server/v2/http"

// Resolves a Discord user id to their wasans player uuid via the
// oauth_accounts link created at login (see findOrCreatePlayer in
// auth-service.ts) — the current source of truth for the Discord<->player
// link, unlike the legacy players.player_id column. Callable by the Discord
// bot (same bot API key it already uses for moderation actions, see
// resolveModeratorUser in moderation-service.ts) as well as by moderators.
export const GET = withV2Params<{ discordId: string }>(async (ctx, { discordId }) => {
  if (!isBotApiRequest(ctx.request, ctx.env)) {
    await requireV2Moderator(ctx)
  }

  const normalizedDiscordId = discordId.trim()
  if (!normalizedDiscordId) {
    return validationError("discordId is required", ctx.requestId)
  }

  const account = await ctx.db.prepare(
    `SELECT player_uuid
     FROM oauth_accounts
     WHERE provider = 'discord' AND provider_account_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`
  )
    .bind(normalizedDiscordId)
    .first<{ player_uuid: string }>()

  if (!account?.player_uuid) {
    return jsonError("No account is linked to this Discord id", 404, { code: "not_found", requestId: ctx.requestId })
  }

  return jsonOk({ uuid: account.player_uuid }, { requestId: ctx.requestId })
})
