import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { jsonError, jsonResponse } from "@/lib/server/http"
import { querySubmissions } from "@/lib/server/services/submission-query-service"
import { createSubmissionsFromRequest } from "@/lib/server/services/submission-write-service"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const data = await querySubmissions(env.wasans, request)
  return jsonResponse(data, 200, cacheHeaders)
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401)
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return jsonError("Submission payload is too large or invalid", 413)
  }

  try {
    const writer = await createSubmissionsFromRequest(env.wasans, env, { uuid: user.uuid })
    const results = await writer(formData)
    return jsonResponse({ results }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create submission"
    const status = message.includes("not found") ? 404 : message.includes("Authentication") ? 401 : 400
    return jsonError(message, status)
  }
}
