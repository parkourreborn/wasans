import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError, jsonResponse } from "@/lib/server/http"

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const row = await env.wasans.prepare(`SELECT 1 AS ok`).first<{ ok: number }>()

  return jsonResponse({
    ok: row?.ok === 1,
    service: "wasans-api",
    version: "v1",
    timestamp: new Date().toISOString(),
  })
}
