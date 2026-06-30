import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRequestId, jsonError, jsonResponse } from "@/lib/server/http"
import { getWorldRecordByTrial } from "@/lib/server/repositories/records-repository"
import { trials } from "@/lib/trials"

const cacheHeaders = {
  "cache-control": "max-age=60, stale-while-revalidate=120",
}

export async function GET(_: Request, { params }: { params: Promise<{ trial: string }> }) {
  const requestId = getRequestId(_)
  const { env } = await getCloudflareContext({ async: true })
  const { trial } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, { code: "internal_error", requestId })
  }

  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400, { code: "validation_error", requestId })
  }

  const record = await getWorldRecordByTrial(env.wasans, trialName)
  return jsonResponse({ record: record || null }, 200, { headers: cacheHeaders, requestId })
}
