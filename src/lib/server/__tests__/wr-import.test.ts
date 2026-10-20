import test from "node:test"
import assert from "node:assert/strict"
import {
  driveFolderId,
  driveRecordDate,
  importKey,
  isDriveFileId,
  isVideoFile,
  parseDriveFileName,
  parseRunTime,
  timeMs,
  versionFromFolder,
} from "@/lib/wr-import"
import { archiveTitle } from "@/lib/archive-filters"

const trials = ["Crystal", "Neon Bold", "Rust Belt", "Glass"]

test("Drive names read as '{lowercase trial} {time} | {player}'", () => {
  assert.deepEqual(parseDriveFileName("crystal 45.123 | Tully.mp4", trials), { trial: "Crystal", trialText: "crystal", time: 45.123, player: "Tully" })
  assert.deepEqual(parseDriveFileName("neon bold 1:02.5 | some_one.mkv", trials), { trial: "Neon Bold", trialText: "neon bold", time: 62.5, player: "some_one" })
  // Spacing and punctuation don't matter, and Drive's " (1)" on a copy goes.
  assert.deepEqual(parseDriveFileName("  rustbelt   30,25|Ana (1).MOV", trials), { trial: "Rust Belt", trialText: "rustbelt", time: 30.25, player: "Ana" })
  // A name that isn't a video extension stays part of the player.
  assert.equal(parseDriveFileName("glass 9.9 | j.r", trials).player, "j.r")
})

test("whatever doesn't read is left for an owner to fill in", () => {
  assert.deepEqual(parseDriveFileName("sawdust 20.000 | Bo.mp4", trials), { trial: null, trialText: "sawdust", time: 20, player: "Bo" })
  assert.deepEqual(parseDriveFileName("crystal | Bo.mp4", trials), { trial: "Crystal", trialText: "crystal", time: null, player: "Bo" })
  assert.deepEqual(parseDriveFileName("crystal 45.1.mp4", trials), { trial: "Crystal", trialText: "crystal", time: 45.1, player: null })
  assert.deepEqual(parseDriveFileName("IMG_0042.mp4", trials).trial, null)
})

test("run times are seconds to the millisecond", () => {
  assert.equal(parseRunTime("45.1234"), 45.123)
  assert.equal(parseRunTime("1:00.000"), 60)
  assert.equal(parseRunTime("1:75.0"), null)
  assert.equal(parseRunTime("0"), null)
  assert.equal(parseRunTime("abc"), null)
  assert.equal(timeMs(45.1229999), 45123)
})

test("a record gets the earlier of Drive's two dates", () => {
  assert.equal(driveRecordDate(200, 100), 100)
  assert.equal(driveRecordDate(200, null), 200)
  assert.equal(driveRecordDate(null, null), null)
})

test("videos are told apart by type or extension", () => {
  assert.ok(isVideoFile("video/mp4", "x"))
  assert.ok(isVideoFile("application/octet-stream", "clip.MKV"))
  assert.ok(!isVideoFile("image/png", "shot.png"))
  assert.ok(!isVideoFile(null, "notes.txt"))
})

test("folder links and ids", () => {
  assert.equal(driveFolderId("https://drive.google.com/drive/u/1/folders/1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5"), "1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5")
  assert.equal(driveFolderId("https://drive.google.com/open?id=1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5"), "1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5")
  assert.equal(driveFolderId(" 1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5 "), "1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5")
  // Never anything that could break out of the Drive query it goes in.
  assert.equal(driveFolderId("abc' or name contains 'x"), null)
  assert.ok(isDriveFileId("1AbC_d-EfGhIjK"))
  assert.ok(!isDriveFileId("../etc"))
  assert.equal(importKey("1AbC_d-EfGhIjK"), "imports/1AbC_d-EfGhIjK")
})

test("a folder named after a version suggests it, deepest first", () => {
  const versions = ["1.0", "1.2.0", "Season 2"]
  assert.equal(versionFromFolder("Old/1.0/v1.2.0", versions), "1.2.0")
  assert.equal(versionFromFolder("season 2/Crystal", versions), "Season 2")
  assert.equal(versionFromFolder("", versions), null)
})

test("archive titles follow the old Drive's naming, without the player's uuid", () => {
  assert.equal(archiveTitle({ trial_name: "Neon Bold", time: 45.6, player_name: "Tully" }), "neon bold 45.600 | Tully")
})
