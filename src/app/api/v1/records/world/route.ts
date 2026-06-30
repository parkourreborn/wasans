import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError, jsonResponse } from "@/lib/server/http"
import { listWorldRecords } from "@/lib/server/repositories/records-repository"

const cacheHeaders = {
  "cache-control": "max-age=60, stale-while-revalidate=120",
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const results = await listWorldRecords(env.wasans)
  return jsonResponse({ results }, 200, cacheHeaders)
}
