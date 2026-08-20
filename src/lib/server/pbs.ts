import "server-only"
import { validSubmissionSql } from "@/lib/server/trial-lifecycle"

const validSql = validSubmissionSql("submissions", "t")

export async function refreshPlayerPb(db: D1Database, playerUuid: string, trialName: string) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(`DELETE FROM pbs WHERE player_uuid = ? AND trial_name = ?`).bind(playerUuid, trialName).run()

  await db.prepare(
    `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
     SELECT submissions.player_uuid, submissions.trial_name, submissions.uuid, submissions.player_name, submissions.time, submissions.date
     FROM submissions
     JOIN trials AS t ON t.name = submissions.trial_name
     WHERE submissions.player_uuid = ?
       AND submissions.trial_name = ?
       AND submissions.state = 'approved'
       AND ${validSql}
     ORDER BY submissions.time ASC, CAST(submissions.date AS INTEGER) ASC, submissions.uuid ASC
     LIMIT 1`
  )
    .bind(playerUuid, trialName, now, now, now)
    .run()
}

export async function refreshPlayerPbs(db: D1Database, playerUuid: string) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(`DELETE FROM pbs WHERE player_uuid = ?`).bind(playerUuid).run()

  await db.prepare(
    `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
     SELECT player_uuid, trial_name, uuid, player_name, time, date
     FROM (
       SELECT submissions.player_uuid, submissions.trial_name, submissions.uuid, submissions.player_name,
              submissions.time, submissions.date,
              ROW_NUMBER() OVER (
                PARTITION BY submissions.trial_name
                ORDER BY submissions.time ASC, CAST(submissions.date AS INTEGER) ASC, submissions.uuid ASC
              ) AS rn
       FROM submissions
       JOIN trials AS t ON t.name = submissions.trial_name
       WHERE submissions.player_uuid = ?
         AND submissions.state = 'approved'
         AND ${validSql}
     )
     WHERE rn = 1`
  )
    .bind(playerUuid, now, now, now)
    .run()
}

// Rebuilds the pbs table for every player on a single trial — used by the
// grace-period sweep when a trial's added/removed/version-changed grace
// window just elapsed, since that can invalidate PB rows across many
// players at once without any of them having a new submission to trigger
// the usual per-player refresh.
export async function refreshPbsForTrial(db: D1Database, trialName: string) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(`DELETE FROM pbs WHERE trial_name = ?`).bind(trialName).run()

  await db.prepare(
    `INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
     SELECT player_uuid, trial_name, uuid, player_name, time, date
     FROM (
       SELECT submissions.player_uuid, submissions.trial_name, submissions.uuid, submissions.player_name,
              submissions.time, submissions.date,
              ROW_NUMBER() OVER (
                PARTITION BY submissions.player_uuid
                ORDER BY submissions.time ASC, CAST(submissions.date AS INTEGER) ASC, submissions.uuid ASC
              ) AS rn
       FROM submissions
       JOIN trials AS t ON t.name = submissions.trial_name
       WHERE submissions.trial_name = ?
         AND submissions.state = 'approved'
         AND ${validSql}
     )
     WHERE rn = 1`
  )
    .bind(trialName, now, now, now)
    .run()
}

export async function refreshAllPbs(db: D1Database) {
  const players = await db.prepare(`SELECT uuid FROM players`).all<{ uuid: string }>()

  for (const player of players.results) {
    await refreshPlayerPbs(db, player.uuid)
  }
}
