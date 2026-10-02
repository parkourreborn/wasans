import "server-only"

// Writes one row per active player into player_rank_snapshots for "today"
// (UTC date), using a single window-function query rather than the
// per-player COUNT(*) that getPlayerRank uses for one-off lookups -- doing
// that per player here would be O(players^2) instead of O(players log players).
//
// Called once a day from a Cron Trigger (see
// src/app/v2/admin/analytics/snapshot-ranks/route.ts) rather than on every
// score change: re-ranking the whole leaderboard on every single submission
// would be wasteful when all a "rank over time" chart needs is daily
// resolution.
export async function snapshotPlayerRanks(db: D1Database, snapshotDate: string = todayUtc()) {
  const { results } = await db
    .prepare(
      `SELECT uuid AS player_uuid, score, RANK() OVER (ORDER BY score DESC) AS rank
       FROM players
       WHERE COALESCE(account_status, 'active') != 'deactivated'`
    )
    .all<{ player_uuid: string; score: number; rank: number }>()

  const rows = results || []
  if (!rows.length) {
    return 0
  }

  await recordRankSnapshots(
    db,
    rows.map((row) => ({ playerUuid: row.player_uuid, rank: row.rank, score: row.score, snapshotDate }))
  )

  return rows.length
}

export type RankSnapshotEntry = { playerUuid: string; rank: number; score: number; snapshotDate: string }

// Upserts an arbitrary batch of (player, date) rank rows -- used both for a
// single day's live snapshot and for the backfill job's many historical
// days at once. Upsert (rather than delete-then-insert) makes this
// idempotent to re-run: a repeat backfill just overwrites the same dates.
export async function recordRankSnapshots(db: D1Database, entries: RankSnapshotEntry[]) {
  if (!entries.length) {
    return
  }

  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO player_rank_snapshots (player_uuid, rank, score, snapshot_date)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (player_uuid, snapshot_date) DO UPDATE SET rank = excluded.rank, score = excluded.score`
      )
      .bind(entry.playerUuid, entry.rank, entry.score, entry.snapshotDate)
  )

  const CHUNK_SIZE = 50
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE))
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

export type RankSnapshotRow = { rank: number; score: number; snapshot_date: string }

export async function getPlayerRankHistory(db: D1Database, playerUuid: string, limit = 180) {
  const { results } = await db
    .prepare(
      `SELECT rank, score, snapshot_date
       FROM player_rank_snapshots
       WHERE player_uuid = ?
       ORDER BY snapshot_date DESC
       LIMIT ?`
    )
    .bind(playerUuid, limit)
    .all<RankSnapshotRow>()

  return (results || []).slice().reverse()
}
