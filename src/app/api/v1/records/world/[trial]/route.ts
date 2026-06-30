import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError, jsonResponse } from "@/lib/server/http"
import { getWorldRecordByTrial } from "@/lib/server/repositories/records-repository"
import { trials } from "@/lib/trials"

const cacheHeaders = {
  "cache-control": "max-age=60, stale-while-revalidate=120",
}

export async function GET(_: Request, { params }: { params: Promise<{ trial: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { trial } = await params

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const trialName = trial.trim()
  if (!trials.includes(trialName as (typeof trials)[number])) {
    return jsonError("Invalid trial", 400)
  }

  const record = await getWorldRecordByTrial(env.wasans, trialName)
  return jsonResponse({ record: record || null }, 200, cacheHeaders)
}
