import test from "node:test"
import assert from "node:assert/strict"
import {
  COMPILATION_STALE_AFTER_SECONDS,
  compilationAsOf,
  compilationObjectKey,
  compilationTitle,
  isCompilationStale,
} from "../compilations"

test("the monthly cron run is titled after the month that just ended", () => {
  const firstOfNovember = new Date(Date.UTC(2026, 10, 1, 0, 0, 5))

  assert.equal(compilationTitle(firstOfNovember, "scheduled"), "World Records — October 2026")
  assert.equal(compilationAsOf(firstOfNovember, "scheduled"), "October 31, 2026")
})

test("the January cron run wraps back to December of the previous year", () => {
  const firstOfJanuary = new Date(Date.UTC(2027, 0, 1, 0, 0, 5))

  assert.equal(compilationTitle(firstOfJanuary, "scheduled"), "World Records — December 2026")
  assert.equal(compilationAsOf(firstOfJanuary, "scheduled"), "December 31, 2026")
  assert.equal(compilationObjectKey(firstOfJanuary, "scheduled", "abc"), "compilations/wr-compilation-2026-12-abc.mp4")
})

test("a manual render is titled after the current month", () => {
  const midOctober = new Date(Date.UTC(2026, 9, 14, 12))

  assert.equal(compilationTitle(midOctober, "manual"), "World Records — October 2026")
  assert.equal(compilationAsOf(midOctober, "manual"), "October 14, 2026")
  assert.equal(compilationObjectKey(midOctober, "manual", "xyz"), "compilations/wr-compilation-2026-10-xyz.mp4")
})

test("February's last day accounts for leap years", () => {
  assert.equal(compilationAsOf(new Date(Date.UTC(2028, 2, 1)), "scheduled"), "February 29, 2028")
  assert.equal(compilationAsOf(new Date(Date.UTC(2027, 2, 1)), "scheduled"), "February 28, 2027")
})

test("an in-progress compilation only counts as stale after the renderer's own timeout", () => {
  const now = 1_000_000

  assert.equal(isCompilationStale(now - 60, now), false)
  assert.equal(isCompilationStale(now - COMPILATION_STALE_AFTER_SECONDS - 1, now), true)
})
