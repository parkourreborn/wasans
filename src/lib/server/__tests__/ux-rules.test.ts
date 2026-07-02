import test from "node:test"
import assert from "node:assert/strict"
import calculateScore from "@/lib/calc-score"
import { getSubmissionErrorMessage, getSubmissionErrorStatus } from "@/lib/submission-errors"
import {
  normalizeModeratorNote,
  normalizeState,
} from "../moderation-normalization"
import {
  shouldUpdateSubmissionThread,
  shouldNotifyModeratorOfChange,
} from "../ux-rules"

test("thread updates are triggered for meaningful moderation changes", () => {
  assert.equal(
    shouldUpdateSubmissionThread({ hasExistingThread: true, stateChanged: true, timeChanged: false, noteChanged: false }),
    true
  )
  assert.equal(
    shouldUpdateSubmissionThread({ hasExistingThread: false, stateChanged: true, timeChanged: false, noteChanged: false }),
    false
  )
  assert.equal(
    shouldUpdateSubmissionThread({ hasExistingThread: true, stateChanged: false, timeChanged: false, noteChanged: false }),
    false
  )
})

test("moderation notifications only fire for meaningful changes", () => {
  assert.equal(
    shouldNotifyModeratorOfChange({ oldPlayerId: "player-1", stateChanged: true, noteChanged: false, scoreChanged: false, rankChanged: false }),
    true
  )
  assert.equal(
    shouldNotifyModeratorOfChange({ oldPlayerId: null, stateChanged: true, noteChanged: false, scoreChanged: false, rankChanged: false }),
    false
  )
  assert.equal(
    shouldNotifyModeratorOfChange({ oldPlayerId: "player-1", stateChanged: false, noteChanged: false, scoreChanged: false, rankChanged: false }),
    false
  )
})

test("score calculation behaves as expected for WR-based scoring", () => {
  assert.equal(calculateScore(10.5, 9, "Crystal"), 1)
  assert.equal(calculateScore(10.5, 25, "Crystal"), 0)
  assert.ok(calculateScore(10.5, 20, "Crystal") > 0)
  assert.ok(calculateScore(10.5, 20, "Crystal") < 0.2)
})

test("moderation normalization handles legacy and malformed values", () => {
  assert.equal(normalizeState("accepted"), "approved")
  assert.equal(normalizeState("approved"), "approved")
  assert.equal(normalizeState("invalid"), null)
  assert.equal(normalizeModeratorNote("  spaced   note  "), "spaced note")
  assert.equal(normalizeModeratorNote("   "), null)
  assert.equal(normalizeModeratorNote("x".repeat(501)), null)
})

test("submission upload and page-load errors surface useful messages", () => {
  assert.equal(
    getSubmissionErrorMessage("Submission 1 needs a Medal link, or a video file", "Unable to create submission"),
    "Submission 1 needs a Medal link, or a video file"
  )
  assert.equal(
    getSubmissionErrorMessage({ message: "Unable to resolve the Medal video URL" }, "Unable to create submission"),
    "Unable to resolve the Medal video URL"
  )
  assert.equal(
    getSubmissionErrorMessage(null, "Unable to load submission data"),
    "Unable to load submission data"
  )
})

test("submission API errors map to the correct HTTP status codes", () => {
  assert.equal(getSubmissionErrorStatus("Authentication required"), 401)
  assert.equal(getSubmissionErrorStatus("Moderator permission is required"), 403)
  assert.equal(getSubmissionErrorStatus("Submission not found"), 404)
  assert.equal(getSubmissionErrorStatus("idempotency-key was already used with a different payload"), 409)
  assert.equal(getSubmissionErrorStatus("Submission payload is too large or invalid"), 413)
  assert.equal(getSubmissionErrorStatus("Rate limit exceeded"), 429)
  assert.equal(getSubmissionErrorStatus("DB binding not available"), 500)
  assert.equal(getSubmissionErrorStatus("Unexpected issue"), 400)
})
