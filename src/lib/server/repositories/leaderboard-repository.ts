import "server-only"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"

export async function listOverallLeaderboard(db: D1Database, limit: number, offset: number) {
  await ensurePlayerAvatarColumns(db)

  const count = await db.prepare(`SELECT COUNT(*) AS count FROM players`).first<{ count: number }>()
  const rows = await db.prepare(
    `SELECT uuid AS player_uuid, player_id, discord_avatar, discord_discriminator, player_name, score AS overall_score, date_joined
     FROM players
     ORDER BY score DESC, player_name ASC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all()

  return {
    results: rows.results || [],
    total: Number(count?.count ?? 0),
  }
}

export async function listTrialLeaderboard(db: D1Database, trialName: string, limit: number, offset: number) {
  await ensurePlayerAvatarColumns(db)

  const wr = await db.prepare(`SELECT submission_uuid, time FROM wrs WHERE trial_name = ?`)
    .bind(trialName)
    .first<{ submission_uuid: string; time: number }>()

  const count = await db.prepare(`SELECT COUNT(*) AS count FROM players`).first<{ count: number }>()

  const rows = await db.prepare(
    `SELECT players.uuid AS player_uuid,
            players.player_id,
            players.discord_avatar,
            players.discord_discriminator,
            players.player_name,
            pbs.time,
            pbs.submission_uuid
     FROM players
     LEFT JOIN pbs ON pbs.player_uuid = players.uuid AND pbs.trial_name = ?
     ORDER BY CASE WHEN pbs.time IS NULL THEN 1 ELSE 0 END, pbs.time ASC, players.player_name ASC
     LIMIT ? OFFSET ?`
  )
    .bind(trialName, limit, offset)
    .all<{
      player_uuid: string
      player_id: string
      discord_avatar?: string | null
      discord_discriminator?: string | null
      player_name: string
      time: number | null
      submission_uuid: string | null
    }>()

  const results = (rows.results || []).map((row, index) => ({
    ...row,
    rank: row.time ? offset + index + 1 : null,
    score: row.time && wr?.time ? Number(Math.pow(wr.time / row.time, 3).toFixed(3)) : 0,
    is_world_record: row.time != null && wr?.time != null && Number(row.time) === Number(wr.time),
    wr_submission_uuid: wr?.submission_uuid || null,
  }))

  return {
    wr: wr || null,
    results,
    total: Number(count?.count ?? 0),
  }
}
