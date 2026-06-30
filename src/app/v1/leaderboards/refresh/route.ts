import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { refreshAllPlayerScores } from "@/lib/server/player-scores"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission is required", 403, { code: "forbidden", requestId })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:leaderboards:refresh", user.uuid), {
    limit: 20,
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

  await refreshAllPlayerScores(env.wasans)
  return jsonResponse({ success: true }, 200, { requestId })
}
