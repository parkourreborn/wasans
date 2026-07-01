import "server-only"

export async function listWorldRecords(db: D1Database) {
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
     ORDER BY wrs.trial_name ASC`
  ).all()

  return rows.results || []
}

export async function getWorldRecordByTrial(db: D1Database, trialName: string) {
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
     WHERE wrs.trial_name = ?`
  )
    .bind(trialName)
    .first()
}
