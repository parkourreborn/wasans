import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"
import { listWorldRecords } from "@/lib/server/repositories/records-repository"

const cacheHeaders = {
  "cache-control": "max-age=60, stale-while-revalidate=120",
}

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const results = await listWorldRecords(env.wasans)
  return jsonResponse({ results }, 200, { headers: cacheHeaders, requestId })
}
