import test from "node:test"
import assert from "node:assert/strict"
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
