import "server-only"
import { PERMISSION_OWNER } from "@/lib/server/auth"

type PlayerListOptions = {
  limit: number
  offset: number
  search?: string
}

export type PlayerWithRankRow = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
  discord_id?: string | null
  has_roblox_avatar?: number | null
  player_name: string
  score: number
  permission: number
  date_joined: number
  rank: number
}

export async function listPlayers(db: D1Database, options: PlayerListOptions) {
  const filters: string[] = ["COALESCE(account_status, 'active') != 'deactivated'"]
  const bindings: Array<string | number> = []

  if (options.search) {
    filters.push("LOWER(player_name) LIKE ?")
    bindings.push(`%${options.search.toLowerCase()}%`)
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

  const count = await db.prepare(`SELECT COUNT(*) AS count FROM players ${whereSql}`)
    .bind(...bindings)
    .first<{ count: number }>()

  // rank and position are worked out over every listed player before the
  // search filter applies, so a search result shows where that player
  // really stands. rank is shared on equal scores (the same number
  // getPlayerRank gives a profile); position is the row's place in this
  // ordering, which is what paging needs.
  const searchSql = options.search ? "WHERE LOWER(player_name) LIKE ?" : ""
  const rows = await db.prepare(
    `SELECT *
     FROM (
       SELECT uuid, player_id, discord_avatar, discord_discriminator, auth_provider,
              discord_id, (avatar_roblox_id IS NOT NULL) AS has_roblox_avatar, player_name, score, permission, date_joined,
              RANK() OVER (ORDER BY score DESC) AS rank,
              ROW_NUMBER() OVER (ORDER BY score DESC, player_name ASC) AS position
       FROM players
       WHERE COALESCE(account_status, 'active') != 'deactivated'
     )
     ${searchSql}
     ORDER BY position ASC
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
    `SELECT uuid, player_id, discord_avatar, discord_discriminator, auth_provider,
            discord_id, (avatar_roblox_id IS NOT NULL) AS has_roblox_avatar, player_name, score, permission, date_joined
     FROM players
     WHERE uuid = ?
       AND COALESCE(account_status, 'active') != 'deactivated'`
  )
    .bind(uuid)
    .first<{
      uuid: string
      player_id: string
      discord_avatar?: string | null
      discord_discriminator?: string | null
      auth_provider?: string | null
      discord_id?: string | null
      has_roblox_avatar?: number | null
      player_name: string
      score: number
      permission: number
      date_joined: number
    }>()
}

export async function countOwners(db: D1Database) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM players
     WHERE permission >= ?
       AND COALESCE(account_status, 'active') = 'active'`
  ).bind(PERMISSION_OWNER).first<{ count: number }>()

  return Number(row?.count ?? 0)
}

export async function setPlayerPermission(db: D1Database, uuid: string, permission: number) {
  await db.prepare(`UPDATE players SET permission = ? WHERE uuid = ?`).bind(permission, uuid).run()
}

export async function getPlayerRank(db: D1Database, score: number) {
  const rank = await db.prepare(
    `SELECT COUNT(*) + 1 AS rank
     FROM players
     WHERE score > ?
       AND COALESCE(account_status, 'active') != 'deactivated'`
  )
    .bind(score)
    .first<{ rank: number }>()

  return Number(rank?.rank ?? 1)
}

// The player's row number in the leaderboard ordering (score, then name),
// which is where "jump to me" has to page to. Unlike getPlayerRank it never
// ties.
export async function getPlayerPosition(db: D1Database, score: number, playerName: string) {
  const row = await db.prepare(
    `SELECT COUNT(*) + 1 AS position
     FROM players
     WHERE (score > ? OR (score = ? AND player_name < ?))
       AND COALESCE(account_status, 'active') != 'deactivated'`
  )
    .bind(score, score, playerName)
    .first<{ position: number }>()

  return Number(row?.position ?? 1)
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
     ORDER BY submissions.date DESC
     LIMIT ? OFFSET ?`
  )
    .bind(playerUuid, options.limit, options.offset)
    .all()

  return rows.results || []
}
