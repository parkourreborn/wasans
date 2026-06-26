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
  const kind = url.searchParams.get("kind") || "all"
  const source = url.searchParams.get("source") || "all"
  const action = url.searchParams.get("action") || "all"
  const query = (url.searchParams.get("q") || "").trim().toLowerCase()
  const since = url.searchParams.get("since")

  const where: string[] = []
  const bindings: unknown[] = []

  if (kind === "errors") {
    where.push("action = ?")
    bindings.push("site_error")
  } else if (kind === "audit") {
    where.push("action <> ?")
    bindings.push("site_error")
  }

  if (action !== "all") {
    where.push("action = ?")
    bindings.push(action)
  }

  if (source !== "all") {
    where.push("details LIKE ?")
    bindings.push(`%"source":"${source}"%`)
  }

  if (since) {
    where.push("created_at > ?")
    bindings.push(since)
  }

  if (query) {
    where.push(
      `LOWER(
        COALESCE(actor_name, '') || ' ' ||
        COALESCE(action, '') || ' ' ||
        COALESCE(entity_type, '') || ' ' ||
        COALESCE(entity_uuid, '') || ' ' ||
        COALESCE(target_type, '') || ' ' ||
        COALESCE(target_uuid, '') || ' ' ||
        COALESCE(details, '')
      ) LIKE ?`
    )
    bindings.push(`%${query}%`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""

  const statement = env.wasans.prepare(
    `SELECT id, created_at, actor_uuid, actor_name, action, entity_type, entity_uuid, target_type, target_uuid, details
     FROM audit_logs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  )

  const countStatement = env.wasans.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`)

  const [rows, count, summary, latestError] = await Promise.all([
    statement.bind(...bindings, limit, offset).all(),
    countStatement.bind(...bindings).first<{ total: number }>(),
    env.wasans.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'site_error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN action = 'site_error' AND created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) as errors_24h
       FROM audit_logs`
    ).first<{ total: number; errors: number | null; errors_24h: number | null }>(),
    env.wasans.prepare(
      `SELECT id, created_at
       FROM audit_logs
       WHERE action = 'site_error'
       ORDER BY created_at DESC
       LIMIT 1`
    ).first<{ id: number; created_at: string }>(),
  ])

  return new Response(JSON.stringify({
    results: rows.results || [],
    total: count?.total ?? 0,
    summary: {
      total: summary?.total ?? 0,
      errors: summary?.errors ?? 0,
      errors_24h: summary?.errors_24h ?? 0,
      latest_error: latestError || null,
    },
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  })
}
