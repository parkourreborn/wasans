import "server-only"
import { trials } from "@/lib/trials"
import { getTrialScoreDistributions } from "@/lib/server/analytics/trial-distribution"

export async function getSiteWideAnalyticsOverview(db: D1Database) {
  const [playerStats, trialDistributions, improvers7d, improvers30d, approvedSubmissions7d] = await Promise.all([
    getPlayerScoreStats(db),
    getTrialScoreDistributions(db, null, trials),
    getBiggestImprovers(db, 7),
    getBiggestImprovers(db, 30),
    getRecentApprovedSubmissionCount(db, 7),
  ])

  const hardestTrial = [...trialDistributions].sort((a, b) => a.mean - b.mean)[0] ?? null
  const widestSpreadTrial = [...trialDistributions].sort((a, b) => b.stddev - a.stddev)[0] ?? null
  const mostContestedTrial = [...trialDistributions].sort((a, b) => b.sample_size - a.sample_size)[0] ?? null

  return {
    player_stats: playerStats,
    trial_distributions: trialDistributions,
    hardest_trial: hardestTrial,
    widest_spread_trial: widestSpreadTrial,
    most_contested_trial: mostContestedTrial,
    biggest_improvers_7d: improvers7d,
    biggest_improvers_30d: improvers30d,
    approved_submissions_7d: approvedSubmissions7d,
  }
}

async function getPlayerScoreStats(db: D1Database) {
  const [totalsRow, medianRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total, AVG(score) AS avg_score
         FROM players
         WHERE COALESCE(account_status, 'active') != 'deactivated'`
      )
      .first<{ total: number; avg_score: number | null }>(),
    db
      .prepare(
        `SELECT score FROM players
         WHERE COALESCE(account_status, 'active') != 'deactivated'
         ORDER BY score
         LIMIT 1 OFFSET (
           SELECT COUNT(*) / 2 FROM players WHERE COALESCE(account_status, 'active') != 'deactivated'
         )`
      )
      .first<{ score: number } | null>(),
  ])

  return {
    total_players: Number(totalsRow?.total ?? 0),
    average_score: totalsRow?.avg_score != null ? Number(Number(totalsRow.avg_score).toFixed(3)) : 0,
    median_score: medianRow?.score != null ? Number(Number(medianRow.score).toFixed(3)) : 0,
  }
}

type ImproverRow = {
  player_uuid: string
  player_name: string
  baseline_score: number
  current_score: number
}

// "Improved over the last N days" = current score vs. their earliest
// score_history row at/after the cutoff. A player with no score-changing
// event in the window is correctly excluded (score_change would be 0).
async function getBiggestImprovers(db: D1Database, days: number, limit = 5) {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400

  const { results } = await db
    .prepare(
      `SELECT h.player_uuid, p.player_name, h.score AS baseline_score, p.score AS current_score
       FROM player_score_history h
       JOIN players p ON p.uuid = h.player_uuid
       WHERE h.recorded_at >= ?
         AND h.id = (
           SELECT MIN(h2.id) FROM player_score_history h2
           WHERE h2.player_uuid = h.player_uuid AND h2.recorded_at >= ?
         )`
    )
    .bind(cutoff, cutoff)
    .all<ImproverRow>()

  return (results || [])
    .map((row) => ({
      player_uuid: row.player_uuid,
      player_name: row.player_name,
      score_change: Number((Number(row.current_score) - Number(row.baseline_score)).toFixed(3)),
    }))
    .filter((row) => row.score_change > 0)
    .sort((a, b) => b.score_change - a.score_change)
    .slice(0, limit)
}

async function getRecentApprovedSubmissionCount(db: D1Database, days: number) {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM submissions WHERE state = 'approved' AND date >= ?`)
    .bind(since)
    .first<{ count: number }>()

  return Number(row?.count ?? 0)
}
