import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError } from "@/lib/server/http"
import { appendExpiredAuthCookies, clearCurrentSession } from "@/lib/server/services/account-service"

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  await clearCurrentSession(env.wasans, request)

  const headers = new Headers({ "content-type": "application/json" })
  headers.set("x-request-id", requestId)
  appendExpiredAuthCookies(headers, request)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
