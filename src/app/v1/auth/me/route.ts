import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, {
      code: "internal_error",
      requestId,
    })
  }

  const user = await getAuthUser(request, env.wasans)
  return jsonResponse({ user }, 200, { requestId })
}
