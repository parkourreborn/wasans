// Display formatting shared by every page, so a time or a score reads the
// same wherever it shows up.

const DASH = "—"

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === "") {
    return Number.NaN
  }
  return typeof value === "number" ? value : Number(value)
}

// Run times always show three decimals: 7.1 reads as 7.100.
export function formatTime(value: number | string | null | undefined) {
  const time = toNumber(value)
  return Number.isFinite(time) && time > 0 ? time.toFixed(3) : DASH
}

export function formatScore(value: number | string | null | undefined) {
  const score = toNumber(value)
  return Number.isFinite(score) ? score.toFixed(3) : "0.000"
}

// A difference shown with its sign, e.g. +0.016 behind or −0.120 faster.
// Uses a real minus sign so it lines up with the plus in a monospace column.
export function formatDelta(value: number) {
  if (!Number.isFinite(value)) {
    return DASH
  }
  const magnitude = Math.abs(value).toFixed(3)
  if (Number(magnitude) === 0) {
    return "0.000"
  }
  return `${value > 0 ? "+" : "−"}${magnitude}`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

// Unix seconds to e.g. "7 Oct 2026" (the order follows the viewer's locale).
export function formatDate(unixSeconds: number | null | undefined) {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) {
    return DASH
  }
  return dateFormatter.format(new Date(unixSeconds * 1000))
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

// Unix seconds to e.g. "7 Oct 2026, 14:32".
export function formatDateTime(unixSeconds: number | null | undefined) {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) {
    return DASH
  }
  return dateTimeFormatter.format(new Date(unixSeconds * 1000))
}

const DAY = 86400

export function daysBetween(fromUnixSeconds: number, toUnixSeconds: number) {
  return Math.max(0, Math.floor((toUnixSeconds - fromUnixSeconds) / DAY))
}

// Compact age for table columns: "today", "41d", "5mo", "2y".
export function formatAge(fromUnixSeconds: number | null | undefined, nowUnixSeconds = Date.now() / 1000) {
  if (!fromUnixSeconds || !Number.isFinite(fromUnixSeconds)) {
    return DASH
  }
  const days = daysBetween(fromUnixSeconds, nowUnixSeconds)
  if (days < 1) return "today"
  if (days < 100) return `${days}d`
  if (days < 730) return `${Math.floor(days / 30.44)}mo`
  return `${Math.floor(days / 365.25)}y`
}

// Long form for titles and sentences: "1 day", "41 days".
export function formatDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`
}

export function formatCount(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : "0"
}

// How long something has been waiting, for queues: "12m", "5h", "3d".
export function formatWaiting(fromUnixSeconds: number | null | undefined, nowUnixSeconds = Date.now() / 1000) {
  if (!fromUnixSeconds || !Number.isFinite(fromUnixSeconds)) {
    return DASH
  }
  const minutes = Math.max(0, Math.floor((nowUnixSeconds - fromUnixSeconds) / 60))
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
