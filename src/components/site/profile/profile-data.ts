import { bronze, plats, type TrialName } from "@/lib/trials"
import { tierForScore } from "@/lib/tiers"

// Shapes the profile reads, and what it works out from them.

export type ProfilePb = {
  trial_name: string
  time: number
  submission_uuid: string
  date: number
  rank?: number
  holders?: number
  video_status?: "processing" | "ready" | "failed" | null
}

export type ProfileComboPb = { category_slug: string; combo_count: number; submission_uuid: string; date: number }
export type ProfilePrize = { prize_uuid: string; title: string; awarded_at: number }

export type ProfilePlayer = {
  uuid: string
  player_name: string
  score: number
  rank: number
  position?: number
  permission: number
  date_joined: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
  pbs?: ProfilePb[]
  combo_pbs?: ProfileComboPb[]
  prizes?: ProfilePrize[]
}

export type ScoreEvent = {
  score: number
  reason: "pb" | "wr_gained" | "wr_affected" | "trial_lifecycle" | "manual_refresh" | "backfill"
  recorded_at: number
  trial_name: string | null
  submission_uuid: string | null
}

export type RankSnapshot = { rank: number; score: number; snapshot_date: string }

export type ProfileAnalytics = {
  score_history?: ScoreEvent[]
  rank_history?: RankSnapshot[]
  last_pb_at?: number | null
  peak_rank?: { rank: number; date: string } | null
}

export type HistoryEntry = { uuid: string; trial_name: string; player_uuid: string; player_name: string; time: number; date: number }

export type Medal = "wr" | "platinum" | "bronze" | "none" | "unplayed"

export const MEDALS: Record<Medal, { label: string; fill: string; ring?: string; order: number }> = {
  wr: { label: "WR", fill: "var(--gold)", order: 0 },
  platinum: { label: "Platinum", fill: "var(--tier-platinum)", order: 1 },
  bronze: { label: "Bronze", fill: "var(--bronze)", order: 2 },
  none: { label: "No medal", fill: "#707070", order: 3 },
  unplayed: { label: "Not played", fill: "transparent", ring: "inset 0 0 0 1px #3a3a3a", order: 4 },
}

export function medalFor(trial: string, time: number | null, holdsWr: boolean): Medal {
  if (time === null) return "unplayed"
  if (holdsWr) return "wr"
  const name = trial as TrialName
  if (plats[name] !== undefined && time <= plats[name]) return "platinum"
  if (bronze[name] !== undefined && time <= bronze[name]) return "bronze"
  return "none"
}

export type RecordHeld = { trial: string; time: number; since: number; submission_uuid: string }
export type RecordLost = { trial: string; time: number; set: number; held: number; takenBy: string; takenByUuid: string }

// Walks every trial's chain of records: the player's entries that are still
// the record, and the ones somebody later beat.
export function recordsFor(history: readonly HistoryEntry[], playerUuid: string, currentWrUuids: ReadonlySet<string>) {
  const byTrial = new Map<string, HistoryEntry[]>()
  for (const entry of history) {
    const list = byTrial.get(entry.trial_name) ?? []
    list.push(entry)
    byTrial.set(entry.trial_name, list)
  }
  const held: RecordHeld[] = []
  const lost: RecordLost[] = []
  for (const [trial, chain] of byTrial) {
    chain.forEach((entry, index) => {
      if (entry.player_uuid !== playerUuid) return
      const next = chain[index + 1]
      if (!next) {
        if (currentWrUuids.has(entry.uuid)) held.push({ trial, time: Number(entry.time), since: entry.date, submission_uuid: entry.uuid })
        return
      }
      // Beating your own record isn't losing it.
      if (next.player_uuid === playerUuid) return
      lost.push({ trial, time: Number(entry.time), set: entry.date, held: next.date - entry.date, takenBy: next.player_name, takenByUuid: next.player_uuid })
    })
  }
  held.sort((a, b) => b.since - a.since)
  lost.sort((a, b) => b.set + b.held - (a.set + a.held))
  return { held, lost, allTime: held.length + lost.length + countSelfBeaten(byTrial, playerUuid) }
}

function countSelfBeaten(byTrial: Map<string, HistoryEntry[]>, playerUuid: string) {
  let count = 0
  for (const chain of byTrial.values()) {
    chain.forEach((entry, index) => {
      const next = chain[index + 1]
      if (entry.player_uuid === playerUuid && next && next.player_uuid === playerUuid) count += 1
    })
  }
  return count
}

export type ActivityEvent = {
  kind: "pb" | "wr" | "lost" | "tier" | "affected" | "trial"
  at: number
  trial: string | null
  submission_uuid: string | null
  text: string
  delta: number | null
}

// The activity feed: PBs and records from the score history, records lost
// from the record chains, and tier changes where the score crossed a line.
export function activityFor(events: readonly ScoreEvent[], lost: readonly RecordLost[]): ActivityEvent[] {
  const feed: ActivityEvent[] = []
  let previous: number | null = null
  for (const event of events) {
    const score = Number(event.score)
    const delta = previous === null ? null : score - previous
    if (event.reason === "pb" && event.trial_name) {
      feed.push({ kind: "pb", at: event.recorded_at, trial: event.trial_name, submission_uuid: event.submission_uuid, text: "New PB on", delta })
    } else if (event.reason === "wr_gained" && event.trial_name) {
      feed.push({ kind: "wr", at: event.recorded_at, trial: event.trial_name, submission_uuid: event.submission_uuid, text: "Took the world record on", delta })
    } else if (event.reason === "wr_affected" && event.trial_name && delta !== null && Math.abs(delta) >= 0.001) {
      feed.push({ kind: "affected", at: event.recorded_at, trial: event.trial_name, submission_uuid: null, text: "A new world record changed the score on", delta })
    } else if (event.reason === "trial_lifecycle" && delta !== null && Math.abs(delta) >= 0.001) {
      feed.push({ kind: "trial", at: event.recorded_at, trial: event.trial_name, submission_uuid: null, text: event.trial_name ? "Trial list changed:" : "The trial list changed", delta })
    }
    if (previous !== null) {
      const before = tierForScore(previous)
      const after = tierForScore(score)
      if (after.min > before.min) {
        feed.push({ kind: "tier", at: event.recorded_at, trial: null, submission_uuid: null, text: `Reached ${after.name}`, delta: null })
      }
    }
    previous = score
  }
  for (const record of lost) {
    feed.push({ kind: "lost", at: record.set + record.held, trial: record.trial, submission_uuid: null, text: `${record.takenBy} took the record on`, delta: null })
  }
  return feed.sort((a, b) => b.at - a.at)
}

export function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

// "today", "yesterday", "3 days ago", then the date.
export function formatAgo(unixSeconds: number | null | undefined, now: number, formatDate: (value: number) => string) {
  if (!unixSeconds) return "—"
  const days = Math.floor((now - unixSeconds) / 86400)
  if (days < 1) return "today"
  if (days < 30) return relative.format(-days, "day")
  return formatDate(unixSeconds)
}
