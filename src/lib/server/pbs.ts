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

  const rows = await db.prepare(
    `SELECT trial_name, uuid, player_name, time, date
     FROM submissions
     WHERE player_uuid = ?
       AND state = 'approved'
     ORDER BY trial_name ASC, time ASC, CAST(date AS INTEGER) ASC, uuid ASC`
  )
    .bind(playerUuid)
    .all<{ trial_name: string; uuid: string; player_name: string; time: number; date: string }>()

  const bestByTrial = new Map<string, { uuid: string; player_name: string; time: number; date: string }>()

  for (const row of rows.results || []) {
    if (!bestByTrial.has(row.trial_name)) {
      bestByTrial.set(row.trial_name, {
        uuid: row.uuid,
        player_name: row.player_name,
        time: row.time,
        date: row.date,
      })
    }
  }

  for (const [trialName, best] of bestByTrial.entries()) {
    await db.prepare(
      `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(playerUuid, trialName, best.uuid, best.player_name, best.time, best.date)
      .run()
  }
}

export async function refreshAllPbs(db: D1Database) {
  const players = await db.prepare(`SELECT uuid FROM players`).all<{ uuid: string }>()

  for (const player of players.results) {
    await refreshPlayerPbs(db, player.uuid)
  }
}
