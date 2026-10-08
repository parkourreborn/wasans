import test from "node:test"
import assert from "node:assert/strict"
import calculateScore from "@/lib/calc-score"
import { formatWaiting } from "@/lib/format"
import { canDeleteRun, canModerateKind, composeDenyNote } from "@/lib/moderation"
import { estimateScore } from "@/lib/score-estimate"

test("deny notes join the picked reasons and the moderator's words", () => {
  assert.equal(composeDenyNote(["Banned glitch used", "Practice mode"], ""), "Banned glitch used. Practice mode.")
  assert.equal(composeDenyNote(["Practice mode"], "  timer hidden at 0:41.  "), "Practice mode. timer hidden at 0:41.")
  assert.equal(composeDenyNote([], "Wrong   trial"), "Wrong trial.")
  assert.equal(composeDenyNote([], "   "), "")
})

test("moderation permissions match the server's tiers", () => {
  assert.equal(canModerateKind("trial", 1), false)
  assert.equal(canModerateKind("trial", 2), true)
  assert.equal(canModerateKind("combo", 1), true)
  assert.equal(canDeleteRun("trial", 2, false), false)
  assert.equal(canDeleteRun("trial", 3, false), true)
  assert.equal(canDeleteRun("trial", 0, true), true)
  assert.equal(canDeleteRun("combo", 1, false), true)
  assert.equal(canDeleteRun("combo", 2, false), false)
})

const records = [
  { trial_name: "Glass", time: 10.873 },
  { trial_name: "Riser", time: 9.214 },
  { trial_name: "Gale", time: 7.016 },
  { trial_name: "Crystal", time: 8.912 },
]

test("the score estimate works out the trial count from the current score", () => {
  const pbs = [
    { trial_name: "Glass", time: 11.5 },
    { trial_name: "Riser", time: 10 },
  ]
  const sum = calculateScore(10.873, 11.5, "Glass") + calculateScore(9.214, 10, "Riser")
  const score = Number((sum / 4).toFixed(3))
  const estimate = estimateScore(pbs, records, score, [{ trial: "Glass", time: 11.2 }])
  const expectedGain = (calculateScore(10.873, 11.2, "Glass") - calculateScore(10.873, 11.5, "Glass")) / 4
  assert.ok(Math.abs(estimate.after - estimate.before - expectedGain) < 1e-9)
  assert.deepEqual([...estimate.perTrial.keys()], ["Glass"])
})

test("the score estimate ignores times that don't beat the PB and caps a new WR at 1", () => {
  const pbs = [{ trial_name: "Glass", time: 11.5 }]
  const score = Number((calculateScore(10.873, 11.5, "Glass") / 4).toFixed(3))
  const slower = estimateScore(pbs, records, score, [{ trial: "Glass", time: 11.9 }])
  assert.equal(slower.after, slower.before)

  const record = estimateScore(pbs, records, score, [{ trial: "Glass", time: 10.5 }])
  assert.equal(record.perTrial.get("Glass")?.after, 1)

  // Two runs on one trial: only the faster one counts.
  const both = estimateScore(pbs, records, score, [
    { trial: "Glass", time: 11.3 },
    { trial: "Glass", time: 11.1 },
  ])
  const single = estimateScore(pbs, records, score, [{ trial: "Glass", time: 11.1 }])
  assert.equal(both.after, single.after)
})

test("a first score falls back to the number of trials with a record", () => {
  const estimate = estimateScore([], records, 0, [{ trial: "Gale", time: 7.5 }])
  assert.ok(Math.abs(estimate.after - calculateScore(7.016, 7.5, "Gale") / records.length) < 1e-9)
})

test("queue waiting times read in minutes, hours, then days", () => {
  const now = 1_000_000
  assert.equal(formatWaiting(now - 20, now), "1m")
  assert.equal(formatWaiting(now - 45 * 60, now), "45m")
  assert.equal(formatWaiting(now - 5 * 3600, now), "5h")
  assert.equal(formatWaiting(now - 47 * 3600, now), "47h")
  assert.equal(formatWaiting(now - 3 * 86400, now), "3d")
  assert.equal(formatWaiting(null, now), "—")
})
