// Filtering and sorting for the public WR archive (/archive), which loads
// every archived file at once and narrows it down in the browser.

export type ArchiveEntry = {
  submission_uuid: string
  trial_name: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  game_version: string | null
  file_name: string
  size: number | null
  source: "original" | "published"
  current: boolean
}

export const NO_VERSION_FILTER = "none"

export const DATE_FILTERS = [
  { value: "", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
  { value: "last-year", label: "Last year" },
] as const

export const SORTS = [
  { value: "", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name, A to Z" },
  { value: "name-desc", label: "Name, Z to A" },
  { value: "size", label: "Largest first" },
  { value: "trial", label: "Trial, A to Z" },
] as const

export type ArchiveFilters = { q: string; trial: string; version: string; date: string; sort: string }
export const FILTER_KEYS = ["q", "trial", "version", "date", "sort"] as const

const sizeFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${sizeFormatter.format(value)} ${units[unit]}`
}

// The window a date filter keeps, in unix seconds, for "now".
function dateWindow(filter: string, now: Date): [number, number] | null {
  const seconds = Math.floor(now.getTime() / 1000)
  const year = now.getFullYear()
  if (filter === "7d") return [seconds - 7 * 86400, Infinity]
  if (filter === "30d") return [seconds - 30 * 86400, Infinity]
  if (filter === "year") return [new Date(year, 0, 1).getTime() / 1000, Infinity]
  if (filter === "last-year") return [new Date(year - 1, 0, 1).getTime() / 1000, new Date(year, 0, 1).getTime() / 1000]
  return null
}

export function filterArchive(entries: readonly ArchiveEntry[], filters: ArchiveFilters, now: Date) {
  const words = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const window = dateWindow(filters.date, now)
  const kept = entries.filter((entry) => {
    if (filters.trial && entry.trial_name !== filters.trial) return false
    if (filters.version === NO_VERSION_FILTER ? entry.game_version !== null : filters.version && entry.game_version !== filters.version) return false
    if (window && (entry.date < window[0] || entry.date >= window[1])) return false
    const haystack = `${entry.file_name} ${entry.trial_name} ${entry.player_name}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  const byName = (a: ArchiveEntry, b: ArchiveEntry) => a.file_name.localeCompare(b.file_name, undefined, { numeric: true, sensitivity: "base" })
  const compare: Record<string, (a: ArchiveEntry, b: ArchiveEntry) => number> = {
    oldest: (a, b) => a.date - b.date,
    name: byName,
    "name-desc": (a, b) => byName(b, a),
    size: (a, b) => (b.size ?? -1) - (a.size ?? -1),
    trial: (a, b) => a.trial_name.localeCompare(b.trial_name) || b.date - a.date,
  }
  return kept.sort(compare[filters.sort] ?? ((a, b) => b.date - a.date))
}
