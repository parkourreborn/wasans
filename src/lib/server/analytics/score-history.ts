import "server-only"

// What kind of event changed a player's score. Kept small and coarse rather
// than mirroring every AuditAction -- this only needs to support the
// score-over-time chart's dots and the admin "biggest improvers" query, not
// a full audit trail (audit_logs already covers that).
//
//  - "pb": the player's own submission improved their PB on a trial (and
//    didn't become that trial's WR).
//  - "wr_gained": the player's own submission became a trial's new WR.
//  - "wr_affected": the player's score on a trial changed because someone
//    ELSE's submission (or a WR-holding submission's deletion) changed that
//    trial's WR -- usually a drop, occasionally a rise if a faster time is
//    deleted. No submission of the player's own to link to.
//  - "trial_lifecycle": the daily grace-period sweep re-derived scores.
//  - "manual_refresh": an owner (or the player themselves) triggered a full
//    recompute.
//  - "backfill": a historical-reconciliation row with no specific single
//    cause (see backfill.ts) -- distinct from the `source` column below,
//    which tracks whether backfill *wrote* the row, not why the score moved.
export type ScoreHistoryReason = "pb" | "wr_gained" | "wr_affected" | "trial_lifecycle" | "manual_refresh" | "backfill"

// Whether live tracking or the backfill job wrote this row. Kept separate
// from `reason` because backfilled rows can carry the same reason values
// live tracking does (e.g. "pb") -- `source` is what lets the backfill job
// find and safely replace only its own past output on a re-run.
export type ScoreHistorySource = "live" | "backfill"

type ScoreHistoryEntry = {
  playerUuid: string
  score: number
  reason?: ScoreHistoryReason
  recordedAt?: number
  trialName?: string | null
  submissionUuid?: string | null
}

// D1's batch() has a practical statement-count ceiling, so large refreshes
// (e.g. a WR change affecting every player who has a PB on that trial) are
// chunked rather than sent as one batch.
const BATCH_CHUNK_SIZE = 50

export async function recordScoreHistory(
  db: D1Database,
  entries: ScoreHistoryEntry[],
  defaultReason: ScoreHistoryReason,
  options: { defaultRecordedAt?: number; source?: ScoreHistorySource } = {}
) {
  if (!entries.length) {
    return
  }

  const defaultRecordedAt = options.defaultRecordedAt ?? Math.floor(Date.now() / 1000)
  const source = options.source ?? "live"

  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO player_score_history (player_uuid, score, reason, recorded_at, trial_name, submission_uuid, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.playerUuid,
        entry.score,
        entry.reason ?? defaultReason,
        entry.recordedAt ?? defaultRecordedAt,
        entry.trialName ?? null,
        entry.submissionUuid ?? null,
        source
      )
  )

  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_CHUNK_SIZE))
  }
}

export type ScoreHistoryRow = {
  score: number
  reason: ScoreHistoryReason
  recorded_at: number
  trial_name: string | null
  submission_uuid: string | null
}

// Returns the most recent `limit` events in chronological order -- ORDER BY
// DESC + LIMIT first, then reversed, so a long-lived player's chart shows
// their recent history instead of being stuck on their oldest events.
export async function getPlayerScoreHistory(db: D1Database, playerUuid: string, limit = 500) {
  const { results } = await db
    .prepare(
      `SELECT score, reason, recorded_at, trial_name, submission_uuid
       FROM player_score_history
       WHERE player_uuid = ?
       ORDER BY recorded_at DESC
       LIMIT ?`
    )
    .bind(playerUuid, limit)
    .all<ScoreHistoryRow>()

  return (results || []).slice().reverse()
}
