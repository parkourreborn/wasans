"use client"

import calculateScore from "@/lib/calc-score"
import { mean, quantile, stddev, type TrialSummary } from "@/lib/analytics"
import { bronze, plats, trials as knownTrials, type TrialName } from "@/lib/trials"

// Per-trial numbers the /analytics page works out from a trial's PB times,
// shared by the trials table, the comparisons and the deep dive.

export type DerivedTrial = TrialSummary & {
  count: number
  scores: number[]
  median: number
  p10: number
  p90: number
  meanTime: number
  meanScore: number
  medianScore: number
  scoreSpread: number
  second: number | null
  tenth: number | null
  gapSecond: number | null
  gapSecondPct: number | null
  gapMedianPct: number | null
  top10Spread: number | null
  wrAgeDays: number | null
  platinumShare: number | null
  scoringShare: number | null
  plat: number | null
  bronze: number | null
}

export function isKnownTrial(name: string): name is TrialName {
  return (knownTrials as readonly string[]).includes(name)
}

export function scoreFor(trial: string, wr: number | null | undefined, time: number) {
  if (!wr || !isKnownTrial(trial) || !(time > 0)) return 0
  return time < wr ? 1 : calculateScore(wr, time, trial)
}

export function deriveTrial(summary: TrialSummary, now: number): DerivedTrial {
  const times = summary.times
  const wr = summary.wr?.time ?? null
  const scores = times.map((time) => scoreFor(summary.trial_name, wr, time)).sort((a, b) => a - b)
  const count = times.length
  const median = quantile(times, 0.5)
  const second = times[1] ?? null
  const tenth = times[9] ?? null
  const plat = isKnownTrial(summary.trial_name) ? plats[summary.trial_name] : null
  const bronzeTime = isKnownTrial(summary.trial_name) ? bronze[summary.trial_name] : null

  return {
    ...summary,
    count,
    scores,
    median,
    p10: quantile(times, 0.1),
    p90: quantile(times, 0.9),
    meanTime: mean(times),
    meanScore: mean(scores),
    medianScore: quantile(scores, 0.5),
    scoreSpread: stddev(scores),
    second,
    tenth,
    gapSecond: wr != null && second != null ? second - wr : null,
    gapSecondPct: wr != null && second != null ? ((second - wr) / wr) * 100 : null,
    gapMedianPct: wr != null && count ? ((median - wr) / wr) * 100 : null,
    top10Spread: tenth != null && times[0] != null ? tenth - times[0] : null,
    wrAgeDays: summary.wr ? Math.max(0, Math.floor((now - summary.wr.date) / 86400)) : null,
    platinumShare: plat != null && count ? (times.filter((time) => time <= plat).length / count) * 100 : null,
    scoringShare: bronzeTime != null && count ? (times.filter((time) => time <= bronzeTime).length / count) * 100 : null,
    plat,
    bronze: bronzeTime,
  }
}

// Where a time lands in a field of PB times (fastest first): its rank and
// the share of the field it's strictly faster than.
export function standing(times: readonly number[], time: number) {
  let faster = 0
  let slower = 0
  for (const value of times) {
    if (value < time) faster += 1
    else if (value > time) slower += 1
  }
  return { rank: faster + 1, beats: times.length ? (slower / times.length) * 100 : 0, topPct: times.length ? ((faster + 1) / times.length) * 100 : 0 }
}

export function formatPct(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`
}

export function formatSeconds(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(3)}s`
}

// Seconds as "42s", "12m", "3.5h", "2.1d".
export function formatSpan(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(seconds < 36000 ? 1 : 0)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** power).toFixed(power >= 3 ? 2 : power === 0 ? 0 : 1)} ${units[power]}`
}
