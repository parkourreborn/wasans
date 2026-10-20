import { listPlaceholderPlayers } from "@/lib/server/services/placeholder-player-service"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Name-only players (no account) for the admin Players page, which the
// players list and search leave out.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  return jsonOk(await listPlaceholderPlayers(ctx.db), { requestId: ctx.requestId })
})
