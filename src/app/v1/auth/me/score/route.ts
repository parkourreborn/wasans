import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"
import { refreshPlayerPbs } from "@/lib/server/pbs"
import { refreshPlayerScore } from "@/lib/server/player-scores"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401, {
      code: "unauthorized",
      requestId,
    })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:auth:me:score", user.uuid), {
    limit: 10,
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

  await refreshPlayerPbs(env.wasans, user.uuid)
  const score = await refreshPlayerScore(env.wasans, user.uuid, { discordUpdateMode: "all" })

  return jsonResponse({ ok: true, score }, 200, { requestId })
}
