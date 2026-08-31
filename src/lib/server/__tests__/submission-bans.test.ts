import test from "node:test"
import assert from "node:assert/strict"
import {
  SUBMISSION_BAN_REASON_MAX_LENGTH,
  formatSubmissionBanMessage,
  normalizeSubmissionBanReason,
} from "../../submission-bans"

test("a blank or non-string reason normalizes to null", () => {
  assert.equal(normalizeSubmissionBanReason(""), null)
  assert.equal(normalizeSubmissionBanReason("   "), null)
  assert.equal(normalizeSubmissionBanReason(undefined), null)
  assert.equal(normalizeSubmissionBanReason(null), null)
  assert.equal(normalizeSubmissionBanReason(42), null)
})

test("a reason is trimmed and capped at the stored length", () => {
  assert.equal(normalizeSubmissionBanReason("  faked run  "), "faked run")
  assert.equal(
    normalizeSubmissionBanReason("x".repeat(SUBMISSION_BAN_REASON_MAX_LENGTH + 50))?.length,
    SUBMISSION_BAN_REASON_MAX_LENGTH
  )
})

test("the ban message includes the reason when there is one", () => {
  assert.equal(formatSubmissionBanMessage("faked run"), "You are banned from submitting runs: faked run")
})

test("a missing reason falls back to the generic message without a dangling colon", () => {
  const message = formatSubmissionBanMessage(null)

  assert.equal(message.includes(":"), false)
  assert.equal(message, formatSubmissionBanMessage("   "))
})
