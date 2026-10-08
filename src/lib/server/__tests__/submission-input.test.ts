import test from "node:test"
import assert from "node:assert/strict"
import { isMedalClipUrl, isYoutubeUrl, parseRunFilename, parseRunTime, TIME_DRAFT_PATTERN } from "@/lib/submission-input"

test("file names give up their trial and time", () => {
  assert.deepEqual(parseRunFilename("Glass 12.345.mp4"), { trialName: "Glass", time: "12.345" })
  assert.deepEqual(parseRunFilename("neon_bold-24.5.mov"), { trialName: "Neon Bold", time: "24.5" })
  assert.deepEqual(parseRunFilename("RustBelt 18.912 pb.mkv"), { trialName: "Rust Belt", time: "18.912" })
  assert.deepEqual(parseRunFilename("circulation13.787.mp4"), { trialName: "Circulation", time: "13.787" })
})

test("dates and resolutions are not times", () => {
  assert.deepEqual(parseRunFilename("2026-10-07 Solar 1080p.mp4"), { trialName: "Solar" })
  assert.deepEqual(parseRunFilename("Medal_2026.10.07_Riser 10.111.mp4").time, "10.111")
  assert.equal(parseRunFilename("clip 1234.5678.mp4").time, undefined)
  assert.equal(parseRunFilename("random video.mp4").trialName, undefined)
})

test("times need to be positive with at most three decimals", () => {
  assert.equal(parseRunTime("12.345"), 12.345)
  assert.equal(parseRunTime(" 7 "), 7)
  assert.equal(parseRunTime("7.1234"), null)
  assert.equal(parseRunTime("0"), null)
  assert.equal(parseRunTime("abc"), null)
  assert.ok(TIME_DRAFT_PATTERN.test("12."))
  assert.ok(!TIME_DRAFT_PATTERN.test("12.3456"))
})

test("proof links match what the server accepts", () => {
  assert.ok(isMedalClipUrl("https://medal.tv/games/roblox/clips/abc123"))
  assert.ok(isMedalClipUrl("https://www.medal.tv/clips/abc123?invite=x"))
  assert.ok(!isMedalClipUrl("http://medal.tv/clips/abc123"))
  assert.ok(!isMedalClipUrl("https://medal.tv/games/roblox"))
  assert.ok(!isMedalClipUrl("https://youtube.com/watch?v=x"))
  assert.ok(isYoutubeUrl("https://youtu.be/abc"))
  assert.ok(isYoutubeUrl("https://www.youtube.com/watch?v=abc"))
  assert.ok(!isYoutubeUrl("http://youtube.com/watch?v=abc"))
  assert.ok(!isYoutubeUrl("https://medal.tv/clips/abc"))
})
