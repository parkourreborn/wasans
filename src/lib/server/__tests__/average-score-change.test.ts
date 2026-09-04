import test from "node:test"
import assert from "node:assert/strict"
import {
  averageScoreChangeForWrChange,
  RANKED_PLAYER_MIN_SCORE,
} from "../average-score-change"

const TRIAL_COUNT = 24

test("a one second WR drop moves ranked players by the amount they actually lost", () => {
  // Three sub-platinum Thread runners, WR going 12.0 -> 11.0. Each of them
  // loses well over 0.005 off their overall score, so the average has to as
  // well rather than landing somewhere near zero.
  const change = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 3,
    rankedPbTimes: [11.5, 12, 13],
  })

  assert.ok(change < -0.005, `expected a drop of more than 0.005, got ${change}`)
})

test("unranked players are left out of the average entirely", () => {
  // Same WR change, same three runners, but the site is also carrying 200
  // accounts sat on a 0 score. Those used to be counted in the denominator
  // and squashed the result down to roughly -0.001.
  const rankedOnly = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 3,
    rankedPbTimes: [11.5, 12, 13],
  })

  const withEveryoneCounted = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 203,
    rankedPbTimes: [11.5, 12, 13],
  })

  assert.ok(rankedOnly < -0.005)
  assert.ok(withEveryoneCounted > -0.002)
  assert.notEqual(rankedOnly, withEveryoneCounted)
})

test("ranked players without a PB on the trial still count as unaffected", () => {
  // Two of the four ranked players never ran Thread. They genuinely didn't
  // move, so they belong in the denominator and pull the average halfway
  // towards zero — that's dilution we want, unlike the 0-score accounts.
  const change = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 4,
    rankedPbTimes: [11.5, 12],
  })

  const bothRunners = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 2,
    rankedPbTimes: [11.5, 12],
  })

  assert.ok(Math.abs(change - bothRunners / 2) < 0.0001)
})

test("degenerate inputs fall back to no change instead of NaN", () => {
  assert.equal(
    averageScoreChangeForWrChange({
      trial: "Thread",
      oldWr: 12,
      newWr: 11,
      trialCount: TRIAL_COUNT,
      rankedPlayerCount: 0,
      rankedPbTimes: [],
    }),
    0
  )

  assert.equal(
    averageScoreChangeForWrChange({
      trial: "Thread",
      oldWr: 12,
      newWr: 11,
      trialCount: 0,
      rankedPlayerCount: 5,
      rankedPbTimes: [12],
    }),
    0
  )

  assert.equal(
    averageScoreChangeForWrChange({
      trial: "Thread",
      oldWr: 12,
      newWr: 0,
      trialCount: TRIAL_COUNT,
      rankedPlayerCount: 5,
      rankedPbTimes: [12],
    }),
    0
  )
})

test("garbage PB times are skipped rather than poisoning the total", () => {
  const clean = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 2,
    rankedPbTimes: [11.5, 12],
  })

  const withGarbage = averageScoreChangeForWrChange({
    trial: "Thread",
    oldWr: 12,
    newWr: 11,
    trialCount: TRIAL_COUNT,
    rankedPlayerCount: 2,
    rankedPbTimes: [11.5, 12, 0, Number.NaN, -4],
  })

  assert.equal(clean, withGarbage)
})

test("the ranked cut-off matches the platinum score threshold", () => {
  assert.equal(RANKED_PLAYER_MIN_SCORE, 0.3)
})
