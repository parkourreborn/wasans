import test from "node:test"
import assert from "node:assert/strict"
import {
  averageScoreChangeForWrChange,
  RANKED_PLAYER_MIN_SCORE,
} from "../average-score-change"

const TRIAL_COUNT = 24

// Thread's platinum is 14s and bronze is 25s, so a PB under 14 scores off the
// WR curve and anything slower doesn't.
const THREAD_WR_DROP = {
  trial: "Thread",
  oldWr: 12,
  newWr: 11,
  trialCount: TRIAL_COUNT,
} as const

test("a one second WR drop moves ranked players by the amount they actually lost", () => {
  // Three sub-platinum Thread runners. Each of them loses well over 0.005 off
  // their overall score, so the average has to as well rather than landing
  // somewhere near zero.
  const change = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12, 13],
  })

  assert.ok(change < -0.005, `expected a drop of more than 0.005, got ${change}`)
})

test("players whose score didn't move are left out of the average", () => {
  // The 16s and 20s runners are past platinum, so their score comes off the
  // bronze/plat curve and the new WR does nothing to it. They shouldn't be
  // halving the figure the three affected runners produced.
  const affectedOnly = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12, 13],
  })

  const withUnaffectedRunners = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12, 13, 16, 20],
  })

  assert.equal(affectedOnly, withUnaffectedRunners)
})

test("a WR change nobody's score reacted to reads as no change", () => {
  const change = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [16, 20, 30],
  })

  assert.equal(change, 0)
})

test("the average is the plain mean of the players who moved", () => {
  const together = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12],
  })

  const first = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5],
  })

  const second = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [12],
  })

  assert.ok(Math.abs(together - (first + second) / 2) < 0.0001)
})

test("degenerate inputs fall back to no change instead of NaN", () => {
  assert.equal(
    averageScoreChangeForWrChange({ ...THREAD_WR_DROP, rankedPbTimes: [] }),
    0
  )

  assert.equal(
    averageScoreChangeForWrChange({ ...THREAD_WR_DROP, trialCount: 0, rankedPbTimes: [12] }),
    0
  )

  assert.equal(
    averageScoreChangeForWrChange({ ...THREAD_WR_DROP, newWr: 0, rankedPbTimes: [12] }),
    0
  )
})

test("garbage PB times are skipped rather than poisoning the total", () => {
  const clean = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12],
  })

  const withGarbage = averageScoreChangeForWrChange({
    ...THREAD_WR_DROP,
    rankedPbTimes: [11.5, 12, 0, Number.NaN, -4],
  })

  assert.equal(clean, withGarbage)
})

test("a brand new trial's first WR counts as a rise for everyone on it", () => {
  const change = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: null,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPbTimes: [11.5, 12],
  })

  assert.ok(change > 0, `expected a rise, got ${change}`)
})

test("the ranked cut-off matches the platinum score threshold", () => {
  assert.equal(RANKED_PLAYER_MIN_SCORE, 0.3)
})
