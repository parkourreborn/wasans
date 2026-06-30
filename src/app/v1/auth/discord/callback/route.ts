import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError } from "@/lib/server/http"
import { completeDiscordOAuth } from "@/lib/server/services/auth-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, {
      code: "internal_error",
      requestId,
    })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:auth:discord:callback"), {
    limit: 30,
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

  return completeDiscordOAuth(request, env)
}
