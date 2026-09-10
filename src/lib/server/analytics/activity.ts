import "server-only"

export type ActivityDay = { date: string; count: number }

// One bucket per UTC day, for the profile-page activity heatmap.
export async function getPlayerActivityHeatmap(db: D1Database, playerUuid: string, days = 84): Promise<ActivityDay[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400

  const { results } = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', date, 'unixepoch') AS day, COUNT(*) AS count
       FROM submissions
       WHERE player_uuid = ? AND state = 'approved' AND date >= ?
       GROUP BY day
       ORDER BY day ASC`
    )
    .bind(playerUuid, since)
    .all<{ day: string; count: number }>()

  return (results || []).map((row) => ({ date: row.day, count: Number(row.count) }))
}

export async function getTimeSinceLastPb(db: D1Database, playerUuid: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT MAX(date) AS last_pb_at FROM pbs WHERE player_uuid = ?`)
    .bind(playerUuid)
    .first<{ last_pb_at: number | null }>()

  return row?.last_pb_at ? Number(row.last_pb_at) : null
}
