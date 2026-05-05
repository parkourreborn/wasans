import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const user = await getAuthUser(request, env.wasans)

  if (!canModerate(user)) {
    return new Response(JSON.stringify({ error: "Moderator permission is required" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })
  }

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"))
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "100")))
  const offset = (page - 1) * limit

  const statement = env.wasans.prepare(
    `SELECT id, created_at, actor_uuid, actor_name, action, entity_type, entity_uuid, target_type, target_uuid, details
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  )

  const { results } = await statement.bind(limit, offset).all()

  return new Response(JSON.stringify({ results: results || [] }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  })
}
