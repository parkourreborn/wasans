import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError } from "@/lib/server/http"
import { appendExpiredAuthCookies, deactivateAccount } from "@/lib/server/services/account-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:account:deactivate", user.uuid), {
    limit: 5,
    windowSeconds: 60,
  })

  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  await deactivateAccount(env.wasans, user)

  const headers = new Headers({ "content-type": "application/json" })
  headers.set("x-request-id", requestId)
  appendExpiredAuthCookies(headers, request)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
