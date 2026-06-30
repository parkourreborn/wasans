import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"
import { getAuditLogs } from "@/lib/server/services/audit-log-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const rate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:admin:audit-logs"), {
    limit: 60,
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

  const result = await getAuditLogs(request, env.wasans)
  if ("error" in result && result.error) {
    return jsonError(result.error, result.status, { requestId })
  }

  return jsonResponse(result.body, 200, { requestId })
}
