import test from "node:test"
import assert from "node:assert/strict"
import { TIERS, nextTier, tierForScore } from "@/lib/tiers"
import { trialFromSlug, trialHref, trialSlug } from "@/lib/trial-slug"
import { trials } from "@/lib/trials"
import { formatAge, formatDelta, formatScore, formatTime } from "@/lib/format"

test("tiers start exactly at their threshold, like the Discord roles", () => {
  const cases: Array<[number, string]> = [
    [0, "unranked"],
    [0.299, "unranked"],
    [0.3, "platinum"],
    [0.399, "platinum"],
    [0.4, "diamond"],
    [0.5, "master3"],
    [0.6, "master2"],
    [0.7, "master1"],
    [0.8, "elite"],
    [0.9, "router"],
    [1, "router"],
  ]

  for (const [score, key] of cases) {
    assert.equal(tierForScore(score).key, key, `score ${score}`)
  }
})

test("tier thresholds ascend and keep the Discord role names", () => {
  const mins = TIERS.map((tier) => tier.min)
  assert.deepEqual([...mins].sort((a, b) => a - b), mins)
  assert.deepEqual(
    TIERS.map((tier) => tier.roleName),
    ["unranked", "platinum", "diamond", "master III", "master II", "master I", "elite", "router"]
  )
})

test("nextTier reports the tier above and the score it takes", () => {
  assert.deepEqual(
    (({ tier, needed }) => ({ key: tier.key, needed }))(nextTier(0.412)!),
    { key: "master3", needed: 0.088 }
  )
  assert.equal(nextTier(0.3)?.tier.key, "diamond")
  assert.equal(nextTier(0.3)?.needed, 0.1)
  assert.equal(nextTier(0.95), null)
})

test("every trial survives a slug round trip", () => {
  for (const trial of trials) {
    assert.equal(trialFromSlug(trialSlug(trial)), trial)
  }
  assert.equal(trialSlug("Neon Bold"), "neon-bold")
  assert.equal(trialSlug("Rust Belt"), "rust-belt")
  assert.equal(trialFromSlug("NEON-BOLD"), "Neon Bold")
  assert.equal(trialFromSlug("not-a-trial"), null)
  assert.equal(trialHref("Rust Belt"), "/trials/rust-belt")
})

test("times and scores always show three decimals", () => {
  assert.equal(formatTime(7.1), "7.100")
  assert.equal(formatTime("12.345"), "12.345")
  assert.equal(formatTime(1.005), "1.005")
  assert.equal(formatTime(0), "—")
  assert.equal(formatTime(null), "—")
  assert.equal(formatScore(0.5), "0.500")
  assert.equal(formatScore(undefined), "0.000")
})

test("deltas carry a sign and a real minus", () => {
  assert.equal(formatDelta(0.016), "+0.016")
  assert.equal(formatDelta(-0.12), "−0.120")
  assert.equal(formatDelta(0.0001), "0.000")
  assert.equal(formatDelta(Number.NaN), "—")
})

test("ages shorten by size", () => {
  const now = 1_000_000_000
  const day = 86400
  assert.equal(formatAge(now - 3600, now), "today")
  assert.equal(formatAge(now - 41 * day, now), "41d")
  assert.equal(formatAge(now - 150 * day, now), "4mo")
  assert.equal(formatAge(now - 800 * day, now), "2y")
  assert.equal(formatAge(null, now), "—")
})
