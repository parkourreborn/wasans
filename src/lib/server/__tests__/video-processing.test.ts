import test from "node:test"
import assert from "node:assert/strict"
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CONSUME_WINDOW_SECONDS,
  isUploadConsumable,
  isValidUploadSize,
  resolveUploadContentType,
  videoJobFromStoredSource,
} from "../video-processing"

test("any video/* content type is accepted as-is", () => {
  assert.equal(resolveUploadContentType("video/mp4", "run.mp4"), "video/mp4")
  assert.equal(resolveUploadContentType("video/quicktime", "run.MOV"), "video/quicktime")
  assert.equal(resolveUploadContentType("Video/WebM", "run.webm"), "video/webm")
})

test("an unrecognised type falls back to the file extension", () => {
  assert.equal(resolveUploadContentType("", "run.mkv"), "application/octet-stream")
  assert.equal(resolveUploadContentType("application/octet-stream", "Crystal 7.553.MKV"), "application/octet-stream")
  assert.equal(resolveUploadContentType("", "notes.txt"), null)
})

test("non-video files are rejected", () => {
  assert.equal(resolveUploadContentType("image/png", "run.png"), null)
  assert.equal(resolveUploadContentType("text/html", "run.mp4"), null)
  assert.equal(resolveUploadContentType("video/mp4; drop table", "run.mp4"), null)
  assert.equal(resolveUploadContentType(undefined, undefined), null)
})

test("upload size must be a positive integer within the cap", () => {
  assert.equal(isValidUploadSize(1), true)
  assert.equal(isValidUploadSize(MAX_UPLOAD_BYTES), true)
  assert.equal(isValidUploadSize(MAX_UPLOAD_BYTES + 1), false)
  assert.equal(isValidUploadSize(0), false)
  assert.equal(isValidUploadSize(1.5), false)
  assert.equal(isValidUploadSize("100"), false)
})

test("an upload can only be consumed once, by its owner, within the window", () => {
  const now = 1_000_000
  const upload = { player_uuid: "p1", created_at: now - 60, consumed_at: null }

  assert.equal(isUploadConsumable(upload, "p1", now), true)
  assert.equal(isUploadConsumable(upload, "p2", now), false)
  assert.equal(isUploadConsumable({ ...upload, consumed_at: now - 1 }, "p1", now), false)
  assert.equal(isUploadConsumable({ ...upload, created_at: now - UPLOAD_CONSUME_WINDOW_SECONDS - 1 }, "p1", now), false)
})

test("stuck jobs are rebuilt from the stored source", () => {
  assert.deepEqual(videoJobFromStoredSource("abc", "upload", "incoming/xyz"), {
    submissionUuid: "abc",
    reason: "upload",
    incomingKey: "incoming/xyz",
    attempt: 1,
  })
  assert.deepEqual(videoJobFromStoredSource("abc", "medal", "https://medal.tv/clips/1"), {
    submissionUuid: "abc",
    reason: "medal",
    medalUrl: "https://medal.tv/clips/1",
    attempt: 1,
  })
  assert.equal(videoJobFromStoredSource("abc", "upload", "scores/abc.mp4"), null)
  assert.equal(videoJobFromStoredSource("abc", null, null), null)
})
