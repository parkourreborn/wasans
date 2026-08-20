import { loadAuthUserByUuid } from "@/lib/server/auth"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonOk({ user: null }, { requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  return jsonOk({ user }, { requestId: ctx.requestId })
})
