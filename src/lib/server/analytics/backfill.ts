import "server-only"
import calculateScore from "@/lib/calc-score"
import { TrialName } from "@/lib/trials"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"
import { VALID_SUBMISSION_SQL } from "@/lib/server/trial-lifecycle"
import { recordScoreHistory, type ScoreHistoryReason } from "@/lib/server/analytics/score-history"
import { recordRankSnapshots } from "@/lib/server/analytics/rank-snapshot"

type SubmissionEvent = {
  uuid: string
  player_uuid: string
  trial_name: TrialName
  time: number
  date: number
}

type PendingEntry = {
  playerUuid: string
  score: number
  recordedAt: number
  reason: ScoreHistoryReason
  trialName: string | null
  submissionUuid: string | null
}

// One-time (but safe to re-run) reconstruction of player_score_history and
// player_rank_snapshots from existing submissions, for players who already
// had activity before this feature existed. It replays approved submissions
// in chronological order, tracking a running WR-per-trial and
// PB-per-(player, trial) exactly like the live refreshPlayerScores/
// refreshScoresForTrial pipeline does, tagging each resulting score change
// the same way live tracking would: "pb" (your own submission improved your
// PB), "wr_gained" (your submission became the trial's WR), or
// "wr_affected" (someone else's WR change moved your score on that trial).
// From that same replay it also derives a full daily rank-snapshot history,
// so "rank over time" isn't just a single point after backfilling.
//
// Known approximations (documented rather than engineered away, since this
// is explicitly a best-effort backfill, not a source of truth):
//  - Trial lifecycle (added/retired/version-bumped) is NOT replayed over
//    time -- it uses today's counted-trial count and today's
//    currently-valid submissions (VALID_SUBMISSION_SQL against "now") for
//    the whole backfilled history, rather than what was valid at each past
//    instant. Live tracking going forward is exact; only the backfilled
//    past is approximate.
//  - The reconciliation pass at the end inserts one more "backfill" row per
//    player, at the current time, using their real stored `players.score`
//    -- so the chart's most recent point and everything recorded live after
//    it are always exact, even if the simulated path leading up to it drifted.
export async function backfillScoreHistory(db: D1Database) {
  const now = Math.floor(Date.now() / 1000)

  const [submissionsResult, trialCount, playersResult] = await Promise.all([
    db
      .prepare(
        `SELECT s.uuid AS uuid, s.player_uuid AS player_uuid, s.trial_name AS trial_name, s.time AS time, s.date AS date
         FROM submissions s
         JOIN trials t ON t.name = s.trial_name
         WHERE s.state = 'approved' AND ${VALID_SUBMISSION_SQL}
         ORDER BY s.date ASC, s.uuid ASC`
      )
      .bind(now, now, now)
      .all<SubmissionEvent>(),
    getCountedTrialCount(db, now),
    db.prepare(`SELECT uuid, score FROM players WHERE COALESCE(account_status, 'active') != 'deactivated'`).all<{
      uuid: string
      score: number
    }>(),
  ])

  const submissions = submissionsResult.results || []
  const players = playersResult.results || []

  // Safe to re-run: wipe this job's own past output (by source, not reason
  // -- live tracking can write the same reason values) rather than
  // accumulating duplicate history on a retry.
  await db.prepare(`DELETE FROM player_score_history WHERE source = 'backfill'`).run()

  const wrByTrial = new Map<string, number>()
  const pbByPlayerTrial = new Map<string, Map<string, number>>()
  const playersByTrial = new Map<string, Set<string>>()
  const lastRecordedScore = new Map<string, number>()
  const entries: PendingEntry[] = []

  const recomputeAndMaybeRecord = (
    playerUuid: string,
    recordedAt: number,
    reason: ScoreHistoryReason,
    trialName: string | null,
    submissionUuid: string | null
  ) => {
    const pbs = pbByPlayerTrial.get(playerUuid)
    if (!pbs) {
      return
    }

    let total = 0
    for (const [trial, time] of pbs) {
      const wr = wrByTrial.get(trial)
      if (!wr || !Number.isFinite(wr) || !Number.isFinite(time) || time <= 0) {
        continue
      }
      total += calculateScore(wr, time, trial as TrialName)
    }

    const score = Number((total / Math.max(trialCount, 1)).toFixed(3))
    if (lastRecordedScore.get(playerUuid) !== score) {
      lastRecordedScore.set(playerUuid, score)
      entries.push({ playerUuid, score, recordedAt, reason, trialName, submissionUuid })
    }
  }

  for (const submission of submissions) {
    const trialName = submission.trial_name
    const time = Number(submission.time)
    const playerUuid = submission.player_uuid
    const recordedAt = Number(submission.date)

    if (!Number.isFinite(time) || time <= 0) {
      continue
    }

    const currentWr = wrByTrial.get(trialName)
    const wrImproved = !currentWr || time < currentWr
    if (wrImproved) {
      wrByTrial.set(trialName, time)
    }

    const playerPbs = pbByPlayerTrial.get(playerUuid) ?? new Map<string, number>()
    const currentPb = playerPbs.get(trialName)
    const pbImproved = currentPb == null || time < currentPb
    if (pbImproved) {
      playerPbs.set(trialName, time)
      pbByPlayerTrial.set(playerUuid, playerPbs)

      const trialPlayers = playersByTrial.get(trialName) ?? new Set<string>()
      trialPlayers.add(playerUuid)
      playersByTrial.set(trialName, trialPlayers)
    }

    if (wrImproved) {
      // A WR change moves the wr/time ratio for every OTHER player who has
      // a PB on this trial -- the submitter's own recompute (tagged
      // "pb"/"wr_gained" below) covers them.
      for (const affectedPlayerUuid of playersByTrial.get(trialName) ?? []) {
        if (affectedPlayerUuid === playerUuid) {
          continue
        }
        recomputeAndMaybeRecord(affectedPlayerUuid, recordedAt, "wr_affected", trialName, null)
      }
    }

    if (pbImproved) {
      const reason: ScoreHistoryReason = wrImproved ? "wr_gained" : "pb"
      recomputeAndMaybeRecord(playerUuid, recordedAt, reason, trialName, submission.uuid)
    } else if (wrImproved) {
      // Shouldn't happen given the app's "must beat your own PB to submit"
      // rule (a WR-improving time is always also a personal PB), but
      // defensive: don't silently drop a WR-setting event just because the
      // submitter's own running PB map already had this exact time on file.
      recomputeAndMaybeRecord(playerUuid, recordedAt, "wr_gained", trialName, submission.uuid)
    }
  }

  for (const player of players) {
    const trueScore = Number(Number(player.score).toFixed(3))
    if (lastRecordedScore.get(player.uuid) !== trueScore) {
      entries.push({ playerUuid: player.uuid, score: trueScore, recordedAt: now, reason: "backfill", trialName: null, submissionUuid: null })
    }
  }

  await recordScoreHistory(
    db,
    entries.map(({ playerUuid, score, recordedAt, reason, trialName, submissionUuid }) => ({
      playerUuid,
      score,
      recordedAt,
      reason,
      trialName,
      submissionUuid,
    })),
    "backfill",
    { source: "backfill" }
  )

  const rankSnapshotDays = await backfillRankSnapshots(db, entries, players, now)

  return {
    submissions_processed: submissions.length,
    history_rows_written: entries.length,
    rank_snapshot_days: rankSnapshotDays.days,
    rank_snapshot_rows_written: rankSnapshotDays.rows,
  }
}

// Derives a full daily rank-snapshot history from the same chronological
// score changes backfillScoreHistory just computed: every player starts at
// score 0, each day's changes are applied in order, and the whole roster is
// ranked (ties sharing a rank, matching RANK() OVER (ORDER BY score DESC))
// at the end of every day that had at least one change.
async function backfillRankSnapshots(
  db: D1Database,
  entries: PendingEntry[],
  players: Array<{ uuid: string; score: number }>,
  now: number
) {
  const scoreByPlayer = new Map<string, number>(players.map((player) => [player.uuid, 0]))

  const dayKey = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10)

  const entriesByDay = new Map<string, PendingEntry[]>()
  for (const entry of entries) {
    const key = dayKey(entry.recordedAt)
    const list = entriesByDay.get(key) ?? []
    list.push(entry)
    entriesByDay.set(key, list)
  }

  const sortedDays = [...entriesByDay.keys()].sort()
  const snapshotRows: Array<{ playerUuid: string; rank: number; score: number; snapshotDate: string }> = []

  for (const day of sortedDays) {
    for (const change of entriesByDay.get(day) ?? []) {
      scoreByPlayer.set(change.playerUuid, change.score)
    }

    const ranked = [...scoreByPlayer.entries()].sort((a, b) => b[1] - a[1])
    let rank = 0
    let previousScore: number | null = null
    let playersSeen = 0

    for (const [playerUuid, score] of ranked) {
      playersSeen += 1
      if (previousScore === null || score < previousScore) {
        rank = playersSeen
        previousScore = score
      }
      snapshotRows.push({ playerUuid, rank, score, snapshotDate: day })
    }
  }

  await recordRankSnapshots(db, snapshotRows)

  // Also take today's live snapshot so the chart's most recent point always
  // matches the real, current leaderboard rather than the last backfilled day.
  const todaySnapshot = sortedDays[sortedDays.length - 1] === dayKey(now) ? 0 : 1
  if (todaySnapshot) {
    const { results } = await db
      .prepare(
        `SELECT uuid AS player_uuid, score, RANK() OVER (ORDER BY score DESC) AS rank
         FROM players
         WHERE COALESCE(account_status, 'active') != 'deactivated'`
      )
      .all<{ player_uuid: string; score: number; rank: number }>()

    const todayRows = (results || []).map((row) => ({
      playerUuid: row.player_uuid,
      rank: row.rank,
      score: Number(row.score),
      snapshotDate: dayKey(now),
    }))
    await recordRankSnapshots(db, todayRows)
    return { days: sortedDays.length + 1, rows: snapshotRows.length + todayRows.length }
  }

  return { days: sortedDays.length, rows: snapshotRows.length }
}
