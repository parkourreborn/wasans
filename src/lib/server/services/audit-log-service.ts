import "server-only"
import { parsePagination } from "@/lib/server/http"

// Auth/permission gating is the caller's responsibility (v2's
// requireV2Moderator) — this only runs the query.
export async function getAuditLogs(request: Request, db: D1Database) {
  const url = new URL(request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100, maxLimit: 200 })
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
    bindings.push(`%\"source\":\"${source}\"%`)
  }

  if (since) {
    where.push("created_at > ?")
    bindings.push(Number(since))
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
  const dayAgo = Math.floor(Date.now() / 1000) - 86400

  // 4 independent reads over the same table with different filters/aggregates
  // — none needs another's result — sent as one D1 batch round trip.
  const [rows, count, summary, latestError] = await db.batch([
    db.prepare(
      `SELECT id, created_at, actor_uuid, actor_name, action, entity_type, entity_uuid, target_type, target_uuid, details
       FROM audit_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset),
    db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`).bind(...bindings),
    db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'site_error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN action = 'site_error' AND created_at >= ? THEN 1 ELSE 0 END) as errors_24h
       FROM audit_logs`
    ).bind(dayAgo),
    db.prepare(
      `SELECT id, created_at
       FROM audit_logs
       WHERE action = 'site_error'
       ORDER BY created_at DESC
       LIMIT 1`
    ),
  ])

  const count0 = count.results[0] as { total: number } | undefined
  const summary0 = summary.results[0] as { total: number; errors: number | null; errors_24h: number | null } | undefined
  const latestError0 = latestError.results[0] as { id: number; created_at: number } | undefined

  return {
    status: 200 as const,
    body: {
      results: rows.results || [],
      total: count0?.total ?? 0,
      page,
      limit,
      summary: {
        total: summary0?.total ?? 0,
        errors: summary0?.errors ?? 0,
        errors_24h: summary0?.errors_24h ?? 0,
        latest_error: latestError0 || null,
      },
    },
  }
}
