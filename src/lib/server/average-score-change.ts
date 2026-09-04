import calculateScore from "@/lib/calc-score"
import type { TrialName } from "@/lib/trials"

// A player only counts towards the "average score change" line once they're
// actually on the board. 0.3 is the platinum cut-off in calc-score, so anyone
// at or below it is either brand new or has nothing but bronze-ish times, and
// their unmoving 0 would otherwise drag the average towards nothing.
export const RANKED_PLAYER_MIN_SCORE = 0.3

// Works out what a WR change on a single trial does to the average score of
// the players it actually touched. Per player that's
// calculateScore(newWr, theirPb) minus calculateScore(oldWr, theirPb),
// divided by the trial count because that's how one trial rolls into their
// overall score.
//
// The denominator is only the ranked players who moved. Anyone sat above
// platinum on this trial scores off the bronze/plat curve rather than off the
// WR, so a new WR leaves them exactly where they were — counting those zeroes
// would water the figure down for no reason, same as the unranked accounts
// filtered out before we get here. A ~1s WR drop costs the runners it affects
// at least 0.005, and that's the number the thread should be showing.
export function averageScoreChangeForWrChange(options: {
  trial: TrialName
  oldWr: number | null
  newWr: number
  trialCount: number
  rankedPbTimes: number[]
}) {
  const { trial, oldWr, newWr, trialCount, rankedPbTimes } = options

  if (trialCount <= 0 || !Number.isFinite(newWr) || newWr <= 0) {
    return 0
  }

  let totalDelta = 0
  let affectedPlayerCount = 0

  for (const rawTime of rankedPbTimes) {
    const time = Number(rawTime)

    if (!Number.isFinite(time) || time <= 0) {
      continue
    }

    const newScore = calculateScore(newWr, time, trial)
    const oldScore = oldWr && oldWr > 0 ? calculateScore(oldWr, time, trial) : 0
    const delta = newScore - oldScore

    if (delta === 0) {
      continue
    }

    totalDelta += delta / trialCount
    affectedPlayerCount += 1
  }

  if (affectedPlayerCount === 0) {
    return 0
  }

  return Number((totalDelta / affectedPlayerCount).toFixed(4))
}
