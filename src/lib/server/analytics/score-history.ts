import "server-only"

// Why a given score_history row was written. Kept small and coarse rather
// than mirroring every AuditAction -- this only needs to support "score
// over time" charts and the admin "biggest improvers" query, not a full
// audit trail (audit_logs already covers that).
export type ScoreHistoryReason =
  | "submission"
  | "wr_changed"
  | "trial_lifecycle"
  | "manual_refresh"
  | "backfill"

type ScoreHistoryEntry = { playerUuid: string; score: number; recordedAt?: number }

// D1's batch() has a practical statement-count ceiling, so large refreshes
// (e.g. a WR change affecting every player who has a PB on that trial) are
// chunked rather than sent as one batch.
const BATCH_CHUNK_SIZE = 50

export async function recordScoreHistory(
  db: D1Database,
  entries: ScoreHistoryEntry[],
  reason: ScoreHistoryReason,
  defaultRecordedAt: number = Math.floor(Date.now() / 1000)
) {
  if (!entries.length) {
    return
  }

  const statements = entries.map((entry) =>
    db
      .prepare(`INSERT INTO player_score_history (player_uuid, score, reason, recorded_at) VALUES (?, ?, ?, ?)`)
      .bind(entry.playerUuid, entry.score, reason, entry.recordedAt ?? defaultRecordedAt)
  )

  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_CHUNK_SIZE))
  }
}

export type ScoreHistoryRow = { score: number; reason: ScoreHistoryReason; recorded_at: number }

// Returns the most recent `limit` events in chronological order -- ORDER BY
// DESC + LIMIT first, then reversed, so a long-lived player's chart shows
// their recent history instead of being stuck on their oldest events.
export async function getPlayerScoreHistory(db: D1Database, playerUuid: string, limit = 500) {
  const { results } = await db
    .prepare(
      `SELECT score, reason, recorded_at
       FROM player_score_history
       WHERE player_uuid = ?
       ORDER BY recorded_at DESC
       LIMIT ?`
    )
    .bind(playerUuid, limit)
    .all<ScoreHistoryRow>()

  return (results || []).slice().reverse()
}
