import test from "node:test"
import assert from "node:assert/strict"
import {
  TRIAL_GRACE_PERIOD_SECONDS,
  canAcceptNewSubmissions,
  isSubmissionValidNow,
  isSubmissionVersionValid,
  isTrialCountedNow,
} from "../trial-lifecycle"

const DAY = 24 * 60 * 60

test("a newly added trial does not count until 7 days after it was added", () => {
  const now = 1_000_000
  const trial = { status: "active" as const, added_at: now - DAY, version: 1, version_changed_at: null, removed_at: null }

  assert.equal(isTrialCountedNow(trial, now), false)
  assert.equal(isTrialCountedNow(trial, now + TRIAL_GRACE_PERIOD_SECONDS), true)
})

test("an active trial older than 7 days counts", () => {
  const now = 1_000_000
  const trial = { status: "active" as const, added_at: now - 30 * DAY, version: 1, version_changed_at: null, removed_at: null }

  assert.equal(isTrialCountedNow(trial, now), true)
})

test("a removed trial keeps counting for 7 days after removal, then stops", () => {
  const now = 1_000_000
  const trial = { status: "removed" as const, added_at: now - 100 * DAY, version: 1, version_changed_at: null, removed_at: now - DAY }

  assert.equal(isTrialCountedNow(trial, now), true)
  assert.equal(isTrialCountedNow(trial, now - DAY + TRIAL_GRACE_PERIOD_SECONDS + 1), false)
})

test("submissions under the old version stay valid for 7 days after a version bump", () => {
  const now = 1_000_000
  const trial = { version: 2, version_changed_at: now - DAY }

  assert.equal(isSubmissionVersionValid(trial, 1, now), true)
  assert.equal(isSubmissionVersionValid(trial, 1, now - DAY + TRIAL_GRACE_PERIOD_SECONDS + 1), false)
})

test("submissions under the current version are always valid", () => {
  const now = 1_000_000
  const trial = { version: 2, version_changed_at: now - 100 * DAY }

  assert.equal(isSubmissionVersionValid(trial, 2, now), true)
})

test("a trial that never changed version treats all matching submissions as valid", () => {
  const now = 1_000_000
  const trial = { version: 1, version_changed_at: null }

  assert.equal(isSubmissionVersionValid(trial, 1, now), true)
  assert.equal(isSubmissionVersionValid(trial, 2, now), false)
})

test("isSubmissionValidNow requires both the trial and the submission version to be valid", () => {
  const now = 1_000_000
  const freshTrial = { status: "active" as const, added_at: now - 30 * DAY, version: 2, version_changed_at: now - 100 * DAY, removed_at: null }

  assert.equal(isSubmissionValidNow(freshTrial, 2, now), true)
  assert.equal(isSubmissionValidNow(freshTrial, 1, now), false)

  const newTrial = { status: "active" as const, added_at: now - DAY, version: 1, version_changed_at: null, removed_at: null }
  assert.equal(isSubmissionValidNow(newTrial, 1, now), false)
})

test("only active trials accept new submissions", () => {
  assert.equal(canAcceptNewSubmissions({ status: "active" }), true)
  assert.equal(canAcceptNewSubmissions({ status: "removed" }), false)
})
