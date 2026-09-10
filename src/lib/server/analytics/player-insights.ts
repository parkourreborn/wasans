import "server-only"
import { getNextRoleProgress } from "@/lib/server/notifications"
import { getPlayerScoreHistory } from "@/lib/server/analytics/score-history"
import type { TrialDistributionPoint } from "@/lib/server/analytics/trial-distribution"

export type PlayerInsights = {
  next_role: { nextRoleName: string; scoreNeeded: number } | null
  score_change_7d: number | null
  score_change_30d: number | null
  weakest_trials: Array<{ trial_name: string; percentile: number }>
}

// Owner/admin-only extras: framed as "what should this player work on"
// rather than just more charts -- reuses the distributions already computed
// for the public response instead of re-querying pbs/wrs.
export async function getPlayerPrivateInsights(
  db: D1Database,
  playerUuid: string,
  currentScore: number,
  distributions: TrialDistributionPoint[]
): Promise<PlayerInsights> {
  const history = await getPlayerScoreHistory(db, playerUuid, 2000)
  const now = Math.floor(Date.now() / 1000)

  const scoreChangeSince = (daysAgo: number) => {
    const cutoff = now - daysAgo * 86400
    // history is chronological ascending -- walk from the end to find the
    // most recent snapshot at or before the cutoff.
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].recorded_at <= cutoff) {
        return Number((currentScore - history[i].score).toFixed(3))
      }
    }
    return null
  }

  const weakestTrials = distributions
    .filter((point): point is TrialDistributionPoint & { percentile: number } => point.percentile != null)
    .sort((a, b) => a.percentile - b.percentile)
    .slice(0, 3)
    .map((point) => ({ trial_name: point.trial_name, percentile: point.percentile }))

  return {
    next_role: getNextRoleProgress(currentScore),
    score_change_7d: scoreChangeSince(7),
    score_change_30d: scoreChangeSince(30),
    weakest_trials: weakestTrials,
  }
}
