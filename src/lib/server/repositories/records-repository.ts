import "server-only"

export async function listWorldRecords(db: D1Database) {
  const rows = await db.prepare(
    `SELECT
       wrs.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator,
       players.auth_provider,
       players.discord_id,
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar,
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

// The "was ever the record" chain: every approved submission that was faster
// than everything approved before it (chronologically, ties broken by uuid).
//
// The old form did this with a correlated `NOT EXISTS` subquery whose
// `earlier.time <= s.time` test isn't part of any index, so each row
// re-scanned the trial's earlier submissions — quadratic in a popular
// trial's history. This runs a single ordered pass: the window keeps the
// best time seen strictly before each row, and a row is a record exactly
// when it beats that running best (or is the first). Equivalent to the old
// query — verified over thousands of randomized, tie-heavy datasets.
export async function getWorldRecordHistory(db: D1Database, trialName: string) {
  const rows = await db.prepare(
    `SELECT
       s.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator,
       players.auth_provider,
       players.discord_id,
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar
     FROM submissions s
     JOIN (
       SELECT uuid FROM (
         SELECT uuid, time,
                MIN(time) OVER (ORDER BY date, uuid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_best
         FROM submissions
         WHERE trial_name = ? AND state = 'approved'
       )
       WHERE prev_best IS NULL OR time < prev_best
     ) records ON records.uuid = s.uuid
     LEFT JOIN players ON players.uuid = s.player_uuid
     ORDER BY s.date, s.uuid`
  )
    .bind(trialName)
    .all()

  return rows.results || []
}

// Same "was ever the record" chain as getWorldRecordHistory, but for every
// trial in a single query — the window is partitioned by trial_name so each
// trial gets its own independent record chain.
export async function getWorldRecordHistoryAll(db: D1Database) {
  const rows = await db.prepare(
    `SELECT
       s.*,
       players.score AS player_score,
       players.player_id,
       players.discord_avatar,
       players.discord_discriminator,
       players.auth_provider,
       players.discord_id,
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar
     FROM submissions s
     JOIN (
       SELECT uuid FROM (
         SELECT uuid, time,
                MIN(time) OVER (PARTITION BY trial_name ORDER BY date, uuid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_best
         FROM submissions
         WHERE state = 'approved'
       )
       WHERE prev_best IS NULL OR time < prev_best
     ) records ON records.uuid = s.uuid
     LEFT JOIN players ON players.uuid = s.player_uuid
     ORDER BY s.trial_name ASC, s.date ASC, s.uuid ASC`
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
       players.auth_provider,
       players.discord_id,
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar,
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
