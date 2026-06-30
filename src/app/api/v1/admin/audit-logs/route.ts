import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError, jsonResponse } from "@/lib/server/http"
import { getAuditLogs } from "@/lib/server/services/audit-log-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const result = await getAuditLogs(request, env.wasans)
  if ("error" in result && result.error) {
    return jsonError(result.error, result.status)
  }

  return jsonResponse(result.body)
}
