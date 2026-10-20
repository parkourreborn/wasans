import test from "node:test"
import assert from "node:assert/strict"
import { filterArchive, formatBytes, NO_VERSION_FILTER, type ArchiveEntry, type ArchiveFilters } from "@/lib/archive-filters"
import { archiveDownloadName, archiveFileName, archiveKey, isArchiveKey, normalizeVersionName, runOriginalKeys } from "@/lib/wr-archive"

const run = { trial_name: "Neon Bold", player_name: "Tully", player_uuid: "54779346-1692", time: 45.6, game_version: "1.2.0" }

test("archived originals are named by trial, player, time and version", () => {
  assert.equal(archiveFileName(run), "Tully (54779346-1692) 45.600 (1.2.0)")
  assert.equal(archiveKey(run), "world-records/Neon Bold/Tully (54779346-1692) 45.600 (1.2.0)")
  assert.equal(archiveKey({ ...run, game_version: null }), "world-records/Neon Bold/Tully (54779346-1692) 45.600 (no version)")
  assert.ok(isArchiveKey(archiveKey(run)))
  assert.ok(!isArchiveKey("originals/abc123"))
  assert.ok(!isArchiveKey(null))
})

test("names can't start folders of their own", () => {
  assert.equal(
    archiveKey({ ...run, trial_name: "Up/Down", player_name: "  a\\b\u0007c  " }),
    "world-records/Up-Down/a-b-c (54779346-1692) 45.600 (1.2.0)"
  )
})

test("deleting a run takes its original and its archived copy", () => {
  assert.deepEqual(runOriginalKeys("abc123", null), ["originals/abc123"])
  assert.deepEqual(runOriginalKeys("abc123", "originals/abc123"), ["originals/abc123"])
  assert.deepEqual(runOriginalKeys("abc123", "world-records/Thread/x"), ["originals/abc123", "world-records/Thread/x"])
})

test("version names are short and plain", () => {
  assert.equal(normalizeVersionName("  1.2.0  "), "1.2.0")
  assert.equal(normalizeVersionName("Season \n  3"), "Season 3")
  assert.equal(normalizeVersionName("v2.0-beta+1"), "v2.0-beta+1")
  for (const bad of ["", "   ", "1/2", ".hidden", "a".repeat(33), "tab\u0007bell", 3, null]) {
    assert.equal(normalizeVersionName(bad), null, String(bad))
  }
})

test("downloads get an extension from the file's type when it has one", () => {
  assert.equal(archiveDownloadName("Tully (x) 45.600 (1.2.0)", "video/mp4"), "Tully (x) 45.600 (1.2.0).mp4")
  assert.equal(archiveDownloadName("Tully", "video/QuickTime"), "Tully.mov")
  assert.equal(archiveDownloadName("Tully", "application/octet-stream"), "Tully")
  assert.equal(archiveDownloadName("Tully", null), "Tully")
})

const entry = (overrides: Partial<ArchiveEntry>): ArchiveEntry => ({
  submission_uuid: "run",
  trial_name: "Thread",
  player_uuid: "p1",
  player_name: "Tully",
  time: 20,
  date: 0,
  game_version: "1.0",
  file_name: "Tully (p1) 20.000 (1.0)",
  size: 100,
  source: "original",
  current: false,
  ...overrides,
})

test("the archive filters by trial, version, date and words, newest first by default", () => {
  const now = new Date(2026, 9, 20)
  const day = 86400
  const seconds = now.getTime() / 1000
  const entries = [
    entry({ submission_uuid: "a", date: seconds - 2 * day, file_name: "Tully (p1) 20.000 (1.2)", game_version: "1.2" }),
    entry({ submission_uuid: "b", date: seconds - 40 * day, trial_name: "Glass", player_name: "Ana", file_name: "Ana (p2) 9.000 (1.0)" }),
    entry({ submission_uuid: "c", date: new Date(2025, 5, 1).getTime() / 1000, game_version: null, file_name: "Tully (p1) 25.000 (no version)", size: 900 }),
  ]
  const ids = (filters: Partial<ArchiveFilters>) =>
    filterArchive(entries, { q: "", trial: "", version: "", date: "", sort: "", ...filters }, now).map((row) => row.submission_uuid)

  assert.deepEqual(ids({}), ["a", "b", "c"])
  assert.deepEqual(ids({ trial: "Glass" }), ["b"])
  assert.deepEqual(ids({ version: "1.2" }), ["a"])
  assert.deepEqual(ids({ version: NO_VERSION_FILTER }), ["c"])
  assert.deepEqual(ids({ date: "7d" }), ["a"])
  assert.deepEqual(ids({ date: "year" }), ["a", "b"])
  assert.deepEqual(ids({ date: "last-year" }), ["c"])
  assert.deepEqual(ids({ q: "tully 25" }), ["c"])
  assert.deepEqual(ids({ q: "glass" }), ["b"])
  assert.deepEqual(ids({ sort: "oldest" }), ["c", "b", "a"])
  assert.deepEqual(ids({ sort: "size" }), ["c", "a", "b"])
  assert.deepEqual(ids({ sort: "name" }), ["b", "a", "c"])
})

test("file sizes read like a file browser's", () => {
  assert.equal(formatBytes(null), "—")
  assert.equal(formatBytes(512), "512 B")
  assert.equal(formatBytes(1536), "1.5 KB")
  assert.equal(formatBytes(250 * 1024 * 1024), "250 MB")
})
