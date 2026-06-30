import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { refreshAllPlayerScores } from "@/lib/server/player-scores"
import { jsonError, jsonResponse } from "@/lib/server/http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)
  if (!canModerate(user)) {
    return jsonError("Moderator permission is required", 403)
  }

  await refreshAllPlayerScores(env.wasans)
  return jsonResponse({ success: true })
}
