import "server-only"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"

export async function listWorldRecords(db: D1Database) {
  await ensurePlayerAvatarColumns(db)

  const rows = await db.prepare(
    `SELECT
       wrs.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator,
       submissions.moderator_note,
       submissions.moderator_username
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     LEFT JOIN submissions ON submissions.uuid = wrs.submission_uuid
     WHERE COALESCE(players.account_status, 'active') != 'deactivated'
     ORDER BY wrs.trial_name ASC`
  ).all()

  return rows.results || []
}

export async function getWorldRecordHistory(db: D1Database, trialName: string) {
  await ensurePlayerAvatarColumns(db)

  const rows = await db.prepare(
    `SELECT
       s.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator
     FROM submissions s
     LEFT JOIN players ON players.uuid = s.player_uuid
     WHERE s.trial_name = ?
       AND s.state = 'approved'
       AND NOT EXISTS (
         SELECT 1
         FROM submissions earlier
         WHERE earlier.trial_name = s.trial_name
           AND earlier.state = 'approved'
           AND (
                 earlier.date < s.date
              OR (earlier.date = s.date AND earlier.uuid < s.uuid)
           )
           AND earlier.time <= s.time
       )
     ORDER BY s.date, s.uuid`
  )
    .bind(trialName)
    .all()

  return rows.results || []
}

export async function getWorldRecordByTrial(db: D1Database, trialName: string) {
  await ensurePlayerAvatarColumns(db)

  return db.prepare(
    `SELECT
       wrs.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator,
       submissions.moderator_note,
       submissions.moderator_username
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     LEFT JOIN submissions ON submissions.uuid = wrs.submission_uuid
     WHERE wrs.trial_name = ?
       AND COALESCE(players.account_status, 'active') != 'deactivated'`
  )
    .bind(trialName)
    .first()
}
