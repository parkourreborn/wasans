import calculateScore from "@/lib/calc-score"
import type { TrialName } from "@/lib/trials"

type Pb = { trial_name: string; time: number | string }
type RecordTime = { trial_name: string; time: number | string }

// What a player's score becomes with some new times, for the submit page
// and the review queue. The score is the average over the counted trials;
// that count isn't sent to the browser, but it falls out of the player's
// score and PBs. When it can't be worked out (a score of 0), the number of
// trials with a record stands in.
export function estimateScore(
  pbs: readonly Pb[],
  records: readonly RecordTime[],
  currentScore: number,
  changes: ReadonlyArray<{ trial: string; time: number }>
) {
  const wrByTrial = new Map(records.map((record) => [record.trial_name, Number(record.time)]))
  const trialScore = (trial: string, time: number) => {
    const wr = wrByTrial.get(trial)
    return wr ? calculateScore(wr, time, trial as TrialName) : 0
  }
  const pbByTrial = new Map(pbs.map((pb) => [pb.trial_name, Number(pb.time)]))
  const sum = pbs.reduce((total, pb) => total + trialScore(pb.trial_name, Number(pb.time)), 0)
  const derived = currentScore > 0.01 ? Math.round(sum / currentScore) : 0
  const count = derived >= 1 && derived <= 80 ? derived : Math.max(records.length, 1)

  // The best new time per trial, kept only where it beats the PB.
  const best = new Map<string, number>()
  for (const change of changes) {
    const previous = best.get(change.trial)
    if (previous === undefined || change.time < previous) best.set(change.trial, change.time)
  }

  let gained = 0
  const perTrial = new Map<string, { before: number; after: number }>()
  for (const [trial, time] of best) {
    const pb = pbByTrial.get(trial)
    if (pb !== undefined && time >= pb) continue
    const before = pb !== undefined ? trialScore(trial, pb) : 0
    const wr = wrByTrial.get(trial)
    const after = wr !== undefined && time < wr ? 1 : trialScore(trial, time)
    perTrial.set(trial, { before, after })
    gained += after - before
  }

  return { before: currentScore, after: currentScore + gained / count, perTrial, trialScore }
}
