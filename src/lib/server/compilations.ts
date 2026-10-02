// Pure naming/timing rules for WR compilation videos. No DB, no
// "server-only", so it stays testable like trial-lifecycle.ts.

export type CompilationTrigger = "scheduled" | "manual"

// The renderer's container gives up after 4h (sleepAfter in
// video-worker/src/index.js) and marks its job failed. A row still
// "in progress" well past that means the failure report itself was lost, so
// it shouldn't block new renders forever.
export const COMPILATION_STALE_AFTER_SECONDS = 5 * 60 * 60

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// The month a compilation covers. The monthly cron runs on the 1st (UTC) and
// shows the WRs standing at the end of the month that just ended, so it
// covers the previous month. A manual render shows the WRs right now, so it
// covers the current month.
export function compilationMonth(now: Date, trigger: CompilationTrigger) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  if (trigger === "manual") {
    return { year, month }
  }
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

export function compilationTitle(now: Date, trigger: CompilationTrigger) {
  const { year, month } = compilationMonth(now, trigger)
  return `World Records — ${MONTHS[month]} ${year}`
}

// Human date the WR list is accurate as of, used in the YouTube description.
export function compilationAsOf(now: Date, trigger: CompilationTrigger) {
  if (trigger === "manual") {
    return `${MONTHS[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`
  }
  const { year, month } = compilationMonth(now, trigger)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${MONTHS[month]} ${lastDay}, ${year}`
}

export function compilationFileStem(now: Date, trigger: CompilationTrigger) {
  const { year, month } = compilationMonth(now, trigger)
  return `wr-compilation-${year}-${String(month + 1).padStart(2, "0")}`
}

// Every render gets its own key (the job id is in it), so re-running a month
// never overwrites a video someone may already have downloaded or linked.
export function compilationObjectKey(now: Date, trigger: CompilationTrigger, id: string) {
  return `compilations/${compilationFileStem(now, trigger)}-${id}.mp4`
}

export function isCompilationStale(updatedAt: number, nowSeconds: number) {
  return nowSeconds - updatedAt > COMPILATION_STALE_AFTER_SECONDS
}
