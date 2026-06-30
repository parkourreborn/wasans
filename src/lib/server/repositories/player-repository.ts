import "server-only"

type PlayerListOptions = {
  limit: number
  offset: number
  search?: string
}

export type PlayerWithRankRow = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
  date_joined: string
  rank: number
}

export async function listPlayers(db: D1Database, options: PlayerListOptions) {
  const filters: string[] = []
  const bindings: Array<string | number> = []

  if (options.search) {
    filters.push("LOWER(player_name) LIKE ?")
    bindings.push(`%${options.search.toLowerCase()}%`)
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

  const count = await db.prepare(`SELECT COUNT(*) AS count FROM players ${whereSql}`)
    .bind(...bindings)
    .first<{ count: number }>()

  const rows = await db.prepare(
    `SELECT uuid, player_id, player_name, score, permission, date_joined
     FROM players
     ${whereSql}
     ORDER BY score DESC, player_name ASC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, options.limit, options.offset)
    .all()

  return {
    results: rows.results || [],
    total: Number(count?.count ?? 0),
  }
}

export async function getPlayerByUuid(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT uuid, player_id, player_name, score, permission, date_joined
     FROM players
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<{ uuid: string; player_id: string; player_name: string; score: number; permission: number; date_joined: string }>()
}

export async function getPlayerRank(db: D1Database, score: number) {
  const rank = await db.prepare(`SELECT COUNT(*) + 1 AS rank FROM players WHERE score > ?`)
    .bind(score)
    .first<{ rank: number }>()

  return Number(rank?.rank ?? 1)
}

export async function getPlayerPbs(db: D1Database, playerUuid: string) {
  const rows = await db.prepare(
    `SELECT trial_name, time, submission_uuid, date
     FROM pbs
     WHERE player_uuid = ?
     ORDER BY trial_name ASC`
  )
    .bind(playerUuid)
    .all()

  return rows.results || []
}

export async function getPlayerSubmissions(
  db: D1Database,
  playerUuid: string,
  options: { limit: number; offset: number; approvedOnly: boolean }
) {
  const stateSql = options.approvedOnly ? "AND submissions.state = 'approved'" : ""

  const rows = await db.prepare(
    `SELECT submissions.*, players.score AS player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.player_uuid = ?
     ${stateSql}
     ORDER BY CAST(submissions.date AS INTEGER) DESC
     LIMIT ? OFFSET ?`
  )
    .bind(playerUuid, options.limit, options.offset)
    .all()

  return rows.results || []
}
