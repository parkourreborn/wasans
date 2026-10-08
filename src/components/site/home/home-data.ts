"use client"

import { apiV2 } from "@/lib/api"
import { useApi } from "@/hooks/use-api"
import type { WorldRecordsResponse } from "@/components/site/trials-index"
import type { VideoStatus } from "@/components/site/run-video"

// Data both homepages share: the WR timeline, the top of the leaderboard,
// and what's up for grabs on /prizes.

const WEEK = 7 * 86400

export type RecordEntry = {
  uuid: string
  trial_name: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  video_status?: VideoStatus | null
}

// A record and the one it replaced, if any.
export type RecordBreak = RecordEntry & { previous: RecordEntry | null }

type HistoryResponse = { data?: RecordEntry[] }

export type TopPlayer = {
  uuid: string
  player_name: string
  score: number
  rank?: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type PlayersResponse = { data?: TopPlayer[]; meta?: { total?: number } }
type CountResponse = { meta?: { count?: number } }

export type ActiveGiveaway = { uuid: string; title: string; max_winners: number; ends_at: number; created_at: number }
export type ActivePrize = {
  uuid: string
  title: string
  criteria_type: "trial_wr" | "combo_wr" | "rankup" | "score_reached"
  criteria_trial_name: string | null
  criteria_combo_category_slug: string | null
  criteria_score_target: number | null
  ends_at: number | null
  created_at: number
}

// Every record ever set, newest first, each with the record it beat. The
// history endpoint lists each trial's records oldest first.
export function useRecordTimeline() {
  const { data, loading, error } = useApi<HistoryResponse>(apiV2("/records/world/history"))
  const rows = data?.data ?? []
  const breaks: RecordBreak[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = { ...rows[index], time: Number(rows[index].time), date: Number(rows[index].date) }
    const before = index > 0 && rows[index - 1].trial_name === row.trial_name ? rows[index - 1] : null
    breaks.push({ ...row, previous: before ? { ...before, time: Number(before.time), date: Number(before.date) } : null })
  }
  breaks.sort((a, b) => b.date - a.date)
  return { breaks, loading, error }
}

export function thisWeek(breaks: RecordBreak[], now: number) {
  return breaks.filter((entry) => entry.date >= now - WEEK)
}

export function useWorldRecords() {
  const { data, loading } = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  return { records: data?.data ?? [], loading }
}

export function useTopPlayers(limit: number) {
  const { data, loading } = useApi<PlayersResponse>(`${apiV2("/players")}?limit=${limit}`)
  return { players: data?.data ?? [], total: data?.meta?.total ?? null, loading }
}

export function useApprovedRunCount() {
  const { data } = useApi<CountResponse>(`${apiV2("/submissions")}?state=approved&limit=1`)
  return data?.meta?.count ?? null
}

// The giveaway ending soonest, else the newest prize: what the homepage
// points at.
export function useUpForGrabs() {
  const giveaways = useApi<{ data?: ActiveGiveaway[] }>(`${apiV2("/giveaways")}?filter=active`)
  const prizes = useApi<{ data?: ActivePrize[] }>(`${apiV2("/prizes")}?filter=active`)
  const giveaway = [...(giveaways.data?.data ?? [])].sort((a, b) => a.ends_at - b.ends_at)[0] ?? null
  const prize = [...(prizes.data?.data ?? [])].sort((a, b) => b.created_at - a.created_at)[0] ?? null
  return { giveaway, prize }
}
