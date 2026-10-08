import { jsonError } from "@/lib/server/http"
import { getAdminPlayer } from "@/lib/server/repositories/admin-repository"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

// One player for the admin Players page: permission, ban, linked accounts
// and run counts.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  await requireV2Owner(ctx)

  const player = await getAdminPlayer(ctx.db, uuid)
  if (!player) {
    return jsonError("Player not found", 404, { code: "not_found", requestId: ctx.requestId })
  }
  return jsonOk(player, { requestId: ctx.requestId })
})
