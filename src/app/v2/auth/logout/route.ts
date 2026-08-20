import { expiredV2AuthCookies, getRefreshCookieValue, jsonOk, withV2Context } from "@/lib/server/v2/http"
import { revokeRefreshToken } from "@/lib/server/v2/tokens"

export const POST = withV2Context(async (ctx) => {
  const presented = getRefreshCookieValue(ctx.request)
  if (presented) {
    await revokeRefreshToken(ctx.db, presented)
  }

  const headers = new Headers()
  for (const cookie of expiredV2AuthCookies(ctx.request)) {
    headers.append("set-cookie", cookie)
  }

  return jsonOk({ ok: true }, { requestId: ctx.requestId, headers })
})
