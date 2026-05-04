import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return Response.json({ error: "DB binding not available" }, { status: 500 })
  }

  const user = await getAuthUser(request, env.wasans)

  return Response.json({ user })
}

