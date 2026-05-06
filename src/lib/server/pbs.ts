import "server-only"

export async function refreshPlayerPb(db: D1Database, playerUuid: string, trialName: string) {
  await db.prepare(`DELETE FROM pbs WHERE player_uuid = ? AND trial_name = ?`).bind(playerUuid, trialName).run()

  await db.prepare(
    `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
     SELECT player_uuid, trial_name, uuid, player_name, time, date
     FROM submissions
     WHERE player_uuid = ?
       AND trial_name = ?
       AND state = 'approved'
     ORDER BY time ASC, CAST(date AS INTEGER) ASC, uuid ASC
     LIMIT 1`
  )
    .bind(playerUuid, trialName)
    .run()
}

export async function refreshPlayerPbs(db: D1Database, playerUuid: string) {
  await db.prepare(`DELETE FROM pbs WHERE player_uuid = ?`).bind(playerUuid).run()

  await db.prepare(
    `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
     SELECT player_uuid, trial_name, uuid, player_name, time, date
     FROM (
       SELECT player_uuid, trial_name, uuid, player_name, time, date,
              ROW_NUMBER() OVER (
                PARTITION BY trial_name
                ORDER BY time ASC, CAST(date AS INTEGER) ASC, uuid ASC
              ) AS rn
       FROM submissions
       WHERE player_uuid = ?
         AND state = 'approved'
     )
     WHERE rn = 1`
  )
    .bind(playerUuid)
    .run()
}

export async function refreshAllPbs(db: D1Database) {
  const players = await db.prepare(`SELECT uuid FROM players`).all<{ uuid: string }>()

  for (const player of players.results) {
    await refreshPlayerPbs(db, player.uuid)
  }
}
