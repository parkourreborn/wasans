import "server-only"

export async function listWorldRecords(db: D1Database) {
  const rows = await db.prepare(
    `SELECT wrs.*, players.score AS player_score
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     ORDER BY wrs.trial_name ASC`
  ).all()

  return rows.results || []
}

export async function getWorldRecordByTrial(db: D1Database, trialName: string) {
  return db.prepare(
    `SELECT wrs.*, players.score AS player_score
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     WHERE wrs.trial_name = ?`
  )
    .bind(trialName)
    .first()
}
