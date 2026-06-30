import { getCloudflareContext } from "@opennextjs/cloudflare"
import { buildPlayerDetail } from "@/lib/server/services/player-service"
import { getRequestId, jsonError, jsonResponse, parseBoolean, validationError } from "@/lib/server/http"

const cacheHeaders = {
  "cache-control": "max-age=30, stale-while-revalidate=60",
}

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid player uuid", requestId)
  }

  const url = new URL(request.url)
  const include = new Set(
    String(url.searchParams.get("include") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )

  const detail = await buildPlayerDetail(env.wasans, uuid, {
    includePbs: include.has("pbs") || parseBoolean(url.searchParams.get("include_pbs"), false),
    includeRecentSubmissions: include.has("recent_submissions"),
    submissionsLimit: Math.max(1, Math.min(50, Number(url.searchParams.get("submissions_limit") || "10"))),
  })

  if (!detail) {
    return jsonResponse({ player: null }, 200, { headers: cacheHeaders, requestId })
  }

  return jsonResponse({ player: detail }, 200, { headers: cacheHeaders, requestId })
}
