import type { RankSnapshotRow } from "@/lib/server/analytics/rank-snapshot"
import type { ScoreHistoryRow } from "@/lib/server/analytics/score-history"

// The site's first month was a transition period, so player profiles start
// their rank, score and world record history on June 1, 2026 (UTC). A world
// record still standing that day counts. No "server-only", so the profile
// and the tests can use it too.
export const HISTORY_START = Date.UTC(2026, 5, 1) / 1000
export const HISTORY_START_DATE = "2026-06-01"

// Both take rows oldest first and leave out the ones before the start, but
// carry the value the player went in with up to the start, so a chart's line
// begins there.

export function scoreHistoryFromStart(rows: readonly ScoreHistoryRow[]): ScoreHistoryRow[] {
  const kept = rows.filter((row) => row.recorded_at >= HISTORY_START)
  const before = rows.filter((row) => row.recorded_at < HISTORY_START).pop()
  if (!before) return kept
  // No single cause moved it, which is what a "backfill" row means.
  return [{ score: before.score, reason: "backfill", recorded_at: HISTORY_START, trial_name: null, submission_uuid: null }, ...kept]
}

export function rankHistoryFromStart(rows: readonly RankSnapshotRow[]): RankSnapshotRow[] {
  const kept = rows.filter((row) => row.snapshot_date >= HISTORY_START_DATE)
  const before = rows.filter((row) => row.snapshot_date < HISTORY_START_DATE).pop()
  if (!before || kept[0]?.snapshot_date === HISTORY_START_DATE) return kept
  return [{ ...before, snapshot_date: HISTORY_START_DATE }, ...kept]
}
