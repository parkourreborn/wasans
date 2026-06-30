import { getCloudflareContext } from "@opennextjs/cloudflare"
import { jsonError } from "@/lib/server/http"
import { startDiscordOAuth } from "@/lib/server/services/auth-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  return startDiscordOAuth(request, env)
}
