import "server-only"
import { ADMIN_ACTIONS, ERROR_ACTIONS, MODERATION_ACTIONS } from "@/lib/admin-logs"
import { parsePagination } from "@/lib/server/http"

const quoted = (actions: readonly string[]) => actions.map((action) => `'${action}'`).join(", ")
const BUCKET_SQL: Record<string, string> = {
  errors: `action IN (${quoted(ERROR_ACTIONS)})`,
  moderation: `action IN (${quoted(MODERATION_ACTIONS)})`,
  admin: `action IN (${quoted(ADMIN_ACTIONS)})`,
  activity: `action NOT IN (${quoted([...ERROR_ACTIONS, ...MODERATION_ACTIONS, ...ADMIN_ACTIONS])})`,
}

// Repeated errors (same source, message and page) collapse into one row
// carrying a count when ?group=1; every other row is its own group.
const GROUP_KEY = `CASE WHEN action = 'site_error'
  THEN 'e|' || COALESCE(json_extract(details, '$.source'), '') || '|' || COALESCE(json_extract(details, '$.message'), '') || '|' || COALESCE(json_extract(details, '$.path'), '')
  ELSE 'a|' || id END`

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
  const bucket = url.searchParams.get("bucket") || "all"
  const group = url.searchParams.get("group") === "1"

  // Filters every bucket shares; the bucket chips are counted over these.
  const shared: string[] = []
  const sharedBindings: unknown[] = []
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
    shared.push("created_at > ?")
    sharedBindings.push(Number(since))
  }

  // Also matches actions on a player's runs, so searching a name finds what
  // moderators did to their submissions, not just what they did themselves.
  if (query) {
    shared.push(
      `(LOWER(
        COALESCE(actor_name, '') || ' ' ||
        COALESCE(action, '') || ' ' ||
        COALESCE(entity_type, '') || ' ' ||
        COALESCE(entity_uuid, '') || ' ' ||
        COALESCE(target_type, '') || ' ' ||
        COALESCE(target_uuid, '') || ' ' ||
        COALESCE(details, '')
      ) LIKE ?
      OR (entity_type = 'submission' AND entity_uuid IN (SELECT uuid FROM submissions WHERE LOWER(player_name) LIKE ?))
      OR (entity_type = 'combo_submission' AND entity_uuid IN (SELECT uuid FROM combo_submissions WHERE LOWER(player_name) LIKE ?)))`
    )
    sharedBindings.push(`%${query}%`, `%${query}%`, `%${query}%`)
  }

  if (BUCKET_SQL[bucket]) {
    where.push(BUCKET_SQL[bucket])
  }

  const allWhere = [...where, ...shared]
  const allBindings = [...bindings, ...sharedBindings]
  const whereSql = allWhere.length > 0 ? `WHERE ${allWhere.join(" AND ")}` : ""
  const sharedSql = shared.length > 0 ? `WHERE ${shared.join(" AND ")}` : ""
  const dayAgo = Math.floor(Date.now() / 1000) - 86400

  // 4 independent reads over the same table with different filters/aggregates
  // — none needs another's result — sent as one D1 batch round trip.
  const [rows, count, summary, latestError, bucketCounts] = await db.batch([
    db.prepare(
      `WITH filtered AS (
         SELECT id, created_at, actor_uuid, actor_name, action, entity_type, entity_uuid, target_type, target_uuid, details,
                ${group ? GROUP_KEY : "'a|' || id"} AS grp
         FROM audit_logs
         ${whereSql}
       ),
       ranked AS (
         SELECT *,
                COUNT(*) OVER (PARTITION BY grp) AS group_count,
                MIN(created_at) OVER (PARTITION BY grp) AS first_at,
                ROW_NUMBER() OVER (PARTITION BY grp ORDER BY created_at DESC, id DESC) AS rn
         FROM filtered
       )
       SELECT r.id, r.created_at, r.actor_uuid, r.actor_name, r.action, r.entity_type, r.entity_uuid, r.target_type, r.target_uuid, r.details,
              r.group_count, r.first_at,
              COALESCE(s.player_name, c.player_name) AS subject_player_name,
              s.time AS subject_time,
              c.combo_count AS subject_combo_count
       FROM ranked AS r
       LEFT JOIN submissions AS s ON r.entity_type = 'submission' AND s.uuid = r.entity_uuid
       LEFT JOIN combo_submissions AS c ON r.entity_type = 'combo_submission' AND c.uuid = r.entity_uuid
       WHERE r.rn = 1
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`
    ).bind(...allBindings, limit, offset),
    db.prepare(
      `SELECT COUNT(DISTINCT ${group ? GROUP_KEY : "id"}) as total FROM audit_logs ${whereSql}`
    ).bind(...allBindings),
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
    db.prepare(
      `SELECT
         COUNT(*) AS all_count,
         SUM(CASE WHEN ${BUCKET_SQL.errors} THEN 1 ELSE 0 END) AS errors,
         SUM(CASE WHEN ${BUCKET_SQL.moderation} THEN 1 ELSE 0 END) AS moderation,
         SUM(CASE WHEN ${BUCKET_SQL.admin} THEN 1 ELSE 0 END) AS admin,
         SUM(CASE WHEN ${BUCKET_SQL.activity} THEN 1 ELSE 0 END) AS activity
       FROM audit_logs ${sharedSql}`
    ).bind(...sharedBindings),
  ])

  const count0 = count.results[0] as { total: number } | undefined
  const summary0 = summary.results[0] as { total: number; errors: number | null; errors_24h: number | null } | undefined
  const latestError0 = latestError.results[0] as { id: number; created_at: number } | undefined
  const buckets0 = bucketCounts.results[0] as Record<string, number | null> | undefined

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
      bucket_counts: {
        all: Number(buckets0?.all_count ?? 0),
        errors: Number(buckets0?.errors ?? 0),
        moderation: Number(buckets0?.moderation ?? 0),
        admin: Number(buckets0?.admin ?? 0),
        activity: Number(buckets0?.activity ?? 0),
      },
    },
  }
}
