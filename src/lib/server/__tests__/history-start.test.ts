import test from "node:test"
import assert from "node:assert/strict"
import { HISTORY_START, HISTORY_START_DATE, rankHistoryFromStart, scoreHistoryFromStart } from "@/lib/history-start"
import { activityFor, recordsFor, type HistoryEntry } from "@/components/site/profile/profile-data"
import { tierForScore } from "@/lib/tiers"

const DAY = 24 * 60 * 60
const APRIL = HISTORY_START - 50 * DAY
const MAY = HISTORY_START - 10 * DAY
const JULY = HISTORY_START + 40 * DAY

const pb = (score: number, recorded_at: number) => ({ score, reason: "pb" as const, recorded_at, trial_name: "Thread", submission_uuid: `run-${recorded_at}` })

test("history starts on June 1, 2026 UTC", () => {
  assert.equal(new Date(HISTORY_START * 1000).toISOString(), "2026-06-01T00:00:00.000Z")
  assert.equal(HISTORY_START_DATE, "2026-06-01")
})

test("score history drops the transition month but starts at the score held going in", () => {
  assert.deepEqual(scoreHistoryFromStart([pb(0.3, APRIL), pb(0.4, MAY), pb(0.5, JULY)]), [
    { score: 0.4, reason: "backfill", recorded_at: HISTORY_START, trial_name: null, submission_uuid: null },
    pb(0.5, JULY),
  ])
  assert.deepEqual(scoreHistoryFromStart([pb(0.4, MAY)]), [
    { score: 0.4, reason: "backfill", recorded_at: HISTORY_START, trial_name: null, submission_uuid: null },
  ])
  assert.deepEqual(scoreHistoryFromStart([pb(0.5, JULY)]), [pb(0.5, JULY)])
  assert.deepEqual(scoreHistoryFromStart([]), [])
})

test("rank history starts on June 1 at the rank held going in", () => {
  const april = { rank: 9, score: 0.3, snapshot_date: "2026-04-10" }
  const may = { rank: 5, score: 0.4, snapshot_date: "2026-05-20" }
  const june3 = { rank: 4, score: 0.45, snapshot_date: "2026-06-03" }
  assert.deepEqual(rankHistoryFromStart([april, may, june3]), [{ ...may, snapshot_date: "2026-06-01" }, june3])

  // A real June 1 snapshot needs nothing carried up.
  const june1 = { rank: 6, score: 0.38, snapshot_date: "2026-06-01" }
  assert.deepEqual(rankHistoryFromStart([may, june1, june3]), [june1, june3])
})

test("the feed leaves out the transition month and measures June from the score held going in", () => {
  const events = activityFor(scoreHistoryFromStart([pb(0.3, APRIL), pb(0.45, MAY), pb(0.52, JULY)]), [])
  assert.deepEqual(
    events.map((event) => [event.kind, event.at]),
    [
      ["pb", JULY],
      ["tier", JULY],
    ]
  )
  assert.ok(Math.abs((events[0].delta ?? 0) - 0.07) < 1e-9)
  assert.equal(events[1].text, `Reached ${tierForScore(0.52).name}`)
})

test("records count only if they were still standing on June 1, with their real set date", () => {
  let id = 0
  const entry = (trial_name: string, player_uuid: string, date: number): HistoryEntry => ({
    uuid: `wr-${(id += 1)}`,
    trial_name,
    player_uuid,
    player_name: player_uuid,
    time: 10,
    date,
  })
  const history = [
    // Taken from them in May: left out.
    entry("Thread", "me", APRIL),
    entry("Thread", "rival", MAY),
    // Set in April and still theirs.
    entry("Ascent", "me", APRIL),
    // Set in April, taken in July.
    entry("Spire", "me", APRIL),
    entry("Spire", "rival", JULY),
    // Beaten by themselves before June (left out), then again in July
    // (counts). Held since the first of them.
    entry("Vault", "me", APRIL - DAY),
    entry("Vault", "me", APRIL),
    entry("Vault", "me", JULY),
    // Beaten by themselves, then taken: one hold, from the first.
    entry("Ledge", "me", APRIL),
    entry("Ledge", "me", MAY),
    entry("Ledge", "rival", JULY),
  ]
  // Each trial's last record is its current one.
  const current = new Set(["Thread", "Ascent", "Spire", "Vault", "Ledge"].map((trial) => history.filter((row) => row.trial_name === trial).pop()!.uuid))
  const { held, lost, allTime } = recordsFor(history, "me", current)

  assert.deepEqual(
    held.map((record) => [record.trial, record.since]),
    [
      ["Ascent", APRIL],
      ["Vault", APRIL - DAY],
    ]
  )
  assert.deepEqual(
    lost.map((record) => [record.trial, record.set, record.held]),
    [
      ["Spire", APRIL, JULY - APRIL],
      ["Ledge", APRIL, JULY - APRIL],
    ]
  )
  assert.equal(allTime, 5)
})

test("records from the old WR Drive count however long ago they were beaten, but stay out of the feed", () => {
  const YEAR = 365 * DAY
  let id = 0
  const entry = (trial_name: string, player_uuid: string, date: number, from_drive = 1): HistoryEntry => ({
    uuid: `wr-${(id += 1)}`,
    trial_name,
    player_uuid,
    player_name: player_uuid,
    time: 10,
    date,
    from_drive,
  })
  const history = [
    // Imported: theirs, taken by a rival, then their own again.
    entry("Thread", "me", APRIL - 2 * YEAR),
    entry("Thread", "rival", APRIL - YEAR),
    entry("Thread", "me", APRIL - YEAR / 2),
    entry("Thread", "me", MAY),
    // A trial the site has nothing newer on: the imported record is last.
    entry("Depot", "me", APRIL - YEAR),
    // On the site, not from the Drive, beaten in May: still left out.
    entry("Spire", "me", APRIL, 0),
    entry("Spire", "rival", MAY, 0),
  ]
  const current = new Set([history[3].uuid])
  const { held, lost, allTime } = recordsFor(history, "me", current)

  assert.deepEqual(
    held.map((record) => [record.trial, record.since]),
    [["Thread", APRIL - YEAR / 2]]
  )
  assert.deepEqual(lost.map((record) => [record.trial, record.takenBy]), [["Thread", "rival"]])
  // Held Thread, lost Thread once, beat their own Thread once, and Depot.
  assert.equal(allTime, 4)
  assert.deepEqual(activityFor([], lost), [])
})
