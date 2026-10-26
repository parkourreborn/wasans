// Shared by the /analytics page and the /v2/analytics endpoints: the time
// ranges a viewer can pick, how activity is bucketed for each, and the small
// statistics helpers both sides use on the same numbers.

export const ANALYTICS_RANGES = ["7d", "30d", "90d", "1y", "all"] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export type AnalyticsBucket = "day" | "week" | "month"

const DAY = 86400

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }

export function parseAnalyticsRange(value: string | null | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.includes(value as AnalyticsRange) ? (value as AnalyticsRange) : "30d"
}

export function rangeDays(range: AnalyticsRange): number | null {
  return range === "all" ? null : RANGE_DAYS[range]
}

// Days for short ranges, weeks for a year, months for all time.
export function rangeBucket(range: AnalyticsRange): AnalyticsBucket {
  if (range === "1y") return "week"
  if (range === "all") return "month"
  return "day"
}

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "Year",
  all: "All time",
}

// Unix seconds of the start of the bucket holding `t` (UTC; weeks start on
// Monday). Mirrors bucketStartSql on the server.
export function bucketStart(t: number, bucket: AnalyticsBucket) {
  const day = Math.floor(t / DAY)
  if (bucket === "day") return day * DAY
  if (bucket === "week") return (Math.floor((day + 3) / 7) * 7 - 3) * DAY
  const date = new Date(t * 1000)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
}

export function nextBucket(t: number, bucket: AnalyticsBucket) {
  if (bucket === "day") return t + DAY
  if (bucket === "week") return t + 7 * DAY
  const date = new Date(t * 1000)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000
}

// Linear-interpolated quantile of an ascending list.
export function quantile(sorted: readonly number[], q: number) {
  if (!sorted.length) return Number.NaN
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN
}

export function stddev(values: readonly number[], average = mean(values)) {
  if (values.length <= 1) return 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length)
}

export type SeriesPoint = { t: number; v: number }

export type TrialSummary = {
  trial_name: string
  status: "active" | "removed"
  version: number
  added_at: number
  wr: { time: number; player_uuid: string; player_name: string; date: number } | null
  // Every current PB on the trial, fastest first (deactivated players left
  // out, as on the leaderboards).
  times: number[]
  // How many times the record has been broken, and by how many players.
  wr_changes: number
  wr_holders: number
  first_wr_at: number | null
  submitted: number
  approved: number
  pbs_set: number
  new_players: number
}

export type PublicAnalytics = {
  generated_at: number
  range: AnalyticsRange
  bucket: AnalyticsBucket
  since: number | null
  trials: TrialSummary[]
  correlation: { trials: string[]; matrix: Array<Array<number | null>>; samples: number[][] }
  activity: {
    series: Record<ActivityMetric, SeriesPoint[]>
    totals: Record<ActivityMetric, number>
    previous: Record<ActivityMetric, number> | null
    // [weekday 0 = Sunday][hour], UTC.
    heatmap: number[][]
  }
  players: {
    scores: number[]
    trials_attempted: number[]
    counted_trials: number
    with_pb: number
    improvers: Array<{ player_uuid: string; player_name: string; score_change: number }>
    churn: {
      from: string | null
      to: string | null
      moved_up: number
      moved_down: number
      unchanged: number
      average_move: number
      top10_kept: number
      climbers: Array<{ player_uuid: string; player_name: string; from: number; to: number }>
    }
    wr_holders: Array<{ player_uuid: string; player_name: string; count: number }>
  }
}

export const ACTIVITY_METRICS = ["submitted", "approved", "pbs", "wrs", "new_players", "active_players"] as const
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number]

export type TrialAnalytics = {
  trial_name: string
  bucket: AnalyticsBucket
  wr_history: Array<{ submission_uuid: string; player_uuid: string; player_name: string; time: number; date: number; imported: number }>
  monthly: Array<{ t: number; runs: number; best: number; median: number; players: number }>
  volume: { submitted: SeriesPoint[]; approved: SeriesPoint[]; pbs: SeriesPoint[] }
  run_times: number[]
  top_grinders: Array<{ player_uuid: string; player_name: string; runs: number; best: number }>
  grind: {
    players: number
    median_runs: number
    median_first_to_pb: number | null
    median_first_to_pb_pct: number | null
    median_pb_age_days: number | null
    pbs_last_30d: number
  }
}

export type StaffAnalytics = {
  generated_at: number
  range: AnalyticsRange
  bucket: AnalyticsBucket
  moderation: {
    pending_trials: number
    pending_combos: number
    oldest_pending_at: number | null
    pending_by_trial: Array<{ trial_name: string; count: number }>
    queue: SeriesPoint[]
    reviewed: number
    approved: number
    denied: number
    review_seconds: { median: number | null; p90: number | null; mean: number | null; series: SeriesPoint[] }
    by_trial: Array<{ trial_name: string; approved: number; denied: number }>
    moderators: Array<{ name: string; approved: number; denied: number; combos: number; median_seconds: number | null }>
    deny_reasons: Array<{ note: string; count: number }>
    combos: { approved: number; denied: number }
  }
  video: {
    status: { processing: number; ready: number; failed: number }
    failed_in_range: number
    failures: SeriesPoint[]
    reasons: Array<{ reason: string; count: number }>
    processing_seconds: { median: number | null; p90: number | null; samples: number }
    sources: Array<{ source: string; count: number }>
    heights: Array<{ label: string; count: number }>
    fps: Array<{ label: string; count: number }>
    median_duration: number | null
    originals: { count: number; bytes: number }
    uploads: { count: number; bytes: number; unused: number }
    backfill: { started: boolean; remaining: number; inFlight: number; failed: number }
  }
  accounts: {
    signups: Record<"discord" | "google" | "roblox", SeriesPoint[]>
    by_provider: Array<{ provider: string; count: number }>
    status: { active: number; deactivated: number; deleted: number }
    placeholders: number
    bans: number
    bans_in_range: number
    deactivated_in_range: number
    deleted_in_range: number
    linked: Array<{ provider: string; count: number }>
    multi_linked: number
    never_submitted: number
    seen: { day: number; week: number; month: number }
    cohorts: Array<{ month: number; size: number; submitted: number; week1: number; week2to4: number; month2to3: number }>
  }
}
