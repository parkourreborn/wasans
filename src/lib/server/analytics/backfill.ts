import "server-only"
import calculateScore from "@/lib/calc-score"
import { TrialName } from "@/lib/trials"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"
import { VALID_SUBMISSION_SQL } from "@/lib/server/trial-lifecycle"
import { recordScoreHistory } from "@/lib/server/analytics/score-history"

type SubmissionEvent = { player_uuid: string; trial_name: TrialName; time: number; date: number }

// One-time (but safe to re-run) reconstruction of player_score_history from
// existing submissions, for players who already had activity before this
// feature existed. It replays approved submissions in chronological order,
// tracking a running WR-per-trial and PB-per-(player, trial) exactly like
// the live refreshPlayerScores/refreshScoresForTrial pipeline does, and
// records a history row whenever a player's resulting overall score changes.
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
        `SELECT s.player_uuid AS player_uuid, s.trial_name AS trial_name, s.time AS time, s.date AS date
         FROM submissions s
         JOIN trials t ON t.name = s.trial_name
         WHERE s.state = 'approved' AND ${VALID_SUBMISSION_SQL}
         ORDER BY s.date ASC, s.uuid ASC`
      )
      .bind(now, now, now)
      .all<SubmissionEvent>(),
    getCountedTrialCount(db, now),
    db.prepare(`SELECT uuid, score FROM players`).all<{ uuid: string; score: number }>(),
  ])

  const submissions = submissionsResult.results || []
  const players = playersResult.results || []

  // Safe to re-run: wipe any previous backfill run rather than accumulating
  // duplicate history on a retry.
  await db.prepare(`DELETE FROM player_score_history WHERE reason = 'backfill'`).run()

  const wrByTrial = new Map<string, number>()
  const pbByPlayerTrial = new Map<string, Map<string, number>>()
  const playersByTrial = new Map<string, Set<string>>()
  const lastRecordedScore = new Map<string, number>()
  const entries: Array<{ playerUuid: string; score: number; recordedAt: number }> = []

  const recomputeAndMaybeRecord = (playerUuid: string, recordedAt: number) => {
    const pbs = pbByPlayerTrial.get(playerUuid)
    if (!pbs) {
      return
    }

    let total = 0
    for (const [trialName, time] of pbs) {
      const wr = wrByTrial.get(trialName)
      if (!wr || !Number.isFinite(wr) || !Number.isFinite(time) || time <= 0) {
        continue
      }
      total += calculateScore(wr, time, trialName as TrialName)
    }

    const score = Number((total / Math.max(trialCount, 1)).toFixed(3))
    if (lastRecordedScore.get(playerUuid) !== score) {
      lastRecordedScore.set(playerUuid, score)
      entries.push({ playerUuid, score, recordedAt })
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
      // A WR change moves the wr/time ratio for every player who has a PB
      // on this trial, not just the submitter.
      for (const affectedPlayerUuid of playersByTrial.get(trialName) ?? []) {
        recomputeAndMaybeRecord(affectedPlayerUuid, recordedAt)
      }
    } else if (pbImproved) {
      recomputeAndMaybeRecord(playerUuid, recordedAt)
    }
  }

  for (const player of players) {
    const trueScore = Number(Number(player.score).toFixed(3))
    if (lastRecordedScore.get(player.uuid) !== trueScore) {
      entries.push({ playerUuid: player.uuid, score: trueScore, recordedAt: now })
    }
  }

  await recordScoreHistory(db, entries, "backfill")

  return { submissions_processed: submissions.length, history_rows_written: entries.length }
}
