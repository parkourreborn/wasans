import "server-only"

// Which runs were ever the world record, for a query over `submissions s`:
// every approved run that nothing approved before it had already matched or
// beaten. A record imported from the old WR Drive (see wr-import-service.ts)
// was a record by definition, so it's always in, and since it never counts
// it doesn't push a run on the site out either.
export const EVER_WR_SQL = `s.state = 'approved' AND (
  s.imported = 1
  OR NOT EXISTS (
    SELECT 1
    FROM submissions earlier
    WHERE earlier.trial_name = s.trial_name
      AND earlier.state = 'approved'
      AND earlier.imported = 0
      AND (earlier.date < s.date OR (earlier.date = s.date AND earlier.uuid < s.uuid))
      AND earlier.time <= s.time
  )
)`

// Whether the old WR Drive vouches for the run: it was imported from there,
// or a file there was matched to it. Profiles count those records even from
// before their history starts.
const FROM_DRIVE_SQL = `EXISTS (SELECT 1 FROM wr_imports i WHERE i.submission_uuid = s.uuid)`

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
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar,
       ${FROM_DRIVE_SQL} AS from_drive
     FROM submissions s
     LEFT JOIN players ON players.uuid = s.player_uuid
     WHERE s.trial_name = ?
       AND ${EVER_WR_SQL}
     ORDER BY s.date, s.uuid`
  )
    .bind(trialName)
    .all()

  return rows.results || []
}

// Same "was ever the record" chain as getWorldRecordHistory, but for every
// trial in a single query instead of one query per trial — the self-join
// is already correlated per trial_name, so dropping the trial_name filter
// and ordering by (trial_name, date, uuid) is enough to get everything at
// once, still grouped and chronological per trial.
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
       (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar,
       ${FROM_DRIVE_SQL} AS from_drive
     FROM submissions s
     LEFT JOIN players ON players.uuid = s.player_uuid
     WHERE ${EVER_WR_SQL}
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
