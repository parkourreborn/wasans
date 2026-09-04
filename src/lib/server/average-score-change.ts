import calculateScore from "@/lib/calc-score"
import type { TrialName } from "@/lib/trials"

// A player only counts towards the "average score change" line once they're
// actually on the board. 0.3 is the platinum cut-off in calc-score, so anyone
// at or below it is either brand new or has nothing but bronze-ish times, and
// their unmoving 0 would otherwise drag the average towards nothing. A ~1s WR
// drop really does cost every ranked player ~0.005, and that's the number the
// thread should be showing.
export const RANKED_PLAYER_MIN_SCORE = 0.3

// Works out what a WR change on a single trial does to the average player
// score. Per player that's calculateScore(newWr, theirPb) minus
// calculateScore(oldWr, theirPb), divided by the trial count because that's
// how one trial rolls into their overall score. Ranked players without a PB
// on this trial move by 0, which is correct — they're unaffected, not
// excluded — but unranked players are left out entirely on both sides of the
// division.
export function averageScoreChangeForWrChange(options: {
  trial: TrialName
  oldWr: number | null
  newWr: number
  trialCount: number
  rankedPlayerCount: number
  rankedPbTimes: number[]
}) {
  const { trial, oldWr, newWr, trialCount, rankedPlayerCount, rankedPbTimes } = options

  if (rankedPlayerCount <= 0 || trialCount <= 0 || !Number.isFinite(newWr) || newWr <= 0) {
    return 0
  }

  let totalDelta = 0

  for (const rawTime of rankedPbTimes) {
    const time = Number(rawTime)

    if (!Number.isFinite(time) || time <= 0) {
      continue
    }

    const newScore = calculateScore(newWr, time, trial)
    const oldScore = oldWr && oldWr > 0 ? calculateScore(oldWr, time, trial) : 0
    totalDelta += (newScore - oldScore) / trialCount
  }

  return Number((totalDelta / rankedPlayerCount).toFixed(4))
}
