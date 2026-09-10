import "server-only"
import { getPlayerActivityHeatmap, getTimeSinceLastPb } from "@/lib/server/analytics/activity"
import { getPlayerScoreHistory } from "@/lib/server/analytics/score-history"
import { getPlayerRankHistory } from "@/lib/server/analytics/rank-snapshot"
import { getTrialScoreDistributions } from "@/lib/server/analytics/trial-distribution"
import { getPlayerByUuid } from "@/lib/server/repositories/player-repository"
import { TrialName } from "@/lib/trials"

export async function buildPlayerAnalytics(db: D1Database, uuid: string) {
  const player = await getPlayerByUuid(db, uuid)
  if (!player) {
    return null
  }

  const attemptedTrialsResult = await db
    .prepare(`SELECT DISTINCT trial_name FROM pbs WHERE player_uuid = ?`)
    .bind(uuid)
    .all<{ trial_name: TrialName }>()
  const attemptedTrials = (attemptedTrialsResult.results || []).map((row) => row.trial_name)

  const [trialDistributions, scoreHistory, rankHistory, activityHeatmap, lastPbAt] = await Promise.all([
    getTrialScoreDistributions(db, uuid, attemptedTrials),
    getPlayerScoreHistory(db, uuid),
    getPlayerRankHistory(db, uuid),
    getPlayerActivityHeatmap(db, uuid),
    getTimeSinceLastPb(db, uuid),
  ])

  return {
    player_found: true as const,
    trial_distributions: trialDistributions,
    score_history: scoreHistory,
    rank_history: rankHistory,
    activity_heatmap: activityHeatmap,
    last_pb_at: lastPbAt,
  }
}
