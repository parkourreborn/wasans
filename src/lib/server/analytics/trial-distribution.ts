import "server-only"
import calculateScore from "@/lib/calc-score"
import { TrialName } from "@/lib/trials"

export type TrialDistributionPoint = {
  trial_name: TrialName
  player_score: number | null
  mean: number
  stddev: number
  sample_size: number
  // % of sampled players (with a PB on this trial) this player's score
  // meets or beats -- the frontend uses mean/stddev to draw a fitted
  // normal curve and this to place/label the player's marker on it.
  percentile: number | null
}

type WrRow = { trial_name: string; time: number }
type PbRow = { player_uuid: string; trial_name: string; time: number }

// Builds one distribution point per requested trial, computed from the
// current wrs/pbs tables (no caching) -- this site's trial count is small
// ("dozens, not thousands" per the trial-sweep route), so an on-demand
// aggregate over pbs is cheap enough to skip a precomputed cache.
export async function getTrialScoreDistributions(
  db: D1Database,
  playerUuid: string | null,
  trialNames: readonly TrialName[]
): Promise<TrialDistributionPoint[]> {
  if (!trialNames.length) {
    return []
  }

  const placeholders = trialNames.map(() => "?").join(",")
  const [wrResult, pbResult] = await db.batch([
    db.prepare(`SELECT trial_name, time FROM wrs WHERE trial_name IN (${placeholders})`).bind(...trialNames),
    db.prepare(`SELECT player_uuid, trial_name, time FROM pbs WHERE trial_name IN (${placeholders})`).bind(...trialNames),
  ])

  const wrByTrial = new Map(((wrResult.results || []) as WrRow[]).map((row) => [row.trial_name, Number(row.time)]))
  const pbRowsByTrial = new Map<string, Array<{ player_uuid: string; time: number }>>()

  for (const row of (pbResult.results || []) as PbRow[]) {
    const list = pbRowsByTrial.get(row.trial_name) ?? []
    list.push({ player_uuid: row.player_uuid, time: Number(row.time) })
    pbRowsByTrial.set(row.trial_name, list)
  }

  const points: TrialDistributionPoint[] = []

  for (const trialName of trialNames) {
    const wr = wrByTrial.get(trialName)
    const pbRows = pbRowsByTrial.get(trialName) ?? []

    if (!wr || !Number.isFinite(wr) || wr <= 0 || pbRows.length === 0) {
      continue
    }

    const scores = pbRows.map((row) => calculateScore(wr, row.time, trialName))
    const mean = average(scores)
    const stddev = populationStdDev(scores, mean)

    const myRow = playerUuid ? pbRows.find((row) => row.player_uuid === playerUuid) : undefined
    const myScore = myRow ? calculateScore(wr, myRow.time, trialName) : null

    const percentile =
      myScore == null
        ? null
        : Number(((scores.filter((score) => score <= myScore).length / scores.length) * 100).toFixed(1))

    points.push({
      trial_name: trialName,
      player_score: myScore == null ? null : Number(myScore.toFixed(3)),
      mean: Number(mean.toFixed(3)),
      stddev: Number(stddev.toFixed(3)),
      sample_size: scores.length,
      percentile,
    })
  }

  return points
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function populationStdDev(values: number[], mean: number) {
  if (values.length <= 1) {
    return 0
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}
