import { apiV2 } from "@/lib/api"
import { formatRelative } from "@/lib/format"

// Shared by the public /prizes page and the owners' /admin/prizes page.

export type PrizeStatus = "active" | "won" | "closed"
export type PrizeCriteriaType = "trial_wr" | "combo_wr" | "rankup" | "score_reached"
export type PrizeFilter = "active" | "history"

export type PrizeWinner = {
  uuid: string
  player_uuid: string
  player_name: string
  claimed: number
  source?: "auto" | "manual"
  awarded_at?: number
  drawn_at?: number
}

export type Prize = {
  uuid: string
  title: string
  description: string | null
  criteria_type: PrizeCriteriaType
  criteria_trial_name: string | null
  criteria_combo_category_slug: string | null
  criteria_score_target: number | null
  max_winners: number | null
  ends_at: number | null
  status: PrizeStatus
  created_at: number
  winners: PrizeWinner[]
}

export type Giveaway = {
  uuid: string
  title: string
  description: string | null
  max_winners: number
  ends_at: number
  status: PrizeStatus
  created_at: number
  winners: PrizeWinner[]
  entry_count: number
  viewer_has_joined: boolean
}

export type PrizeCandidate = {
  uuid: string
  prize_uuid: string
  player_uuid: string
  player_name: string
  detected_at: number
  event_details: string | null
}

type Envelope<T> = { data?: T; error?: { message?: string } | string }

function errorFrom(json: unknown, fallback: string) {
  const error = (json as Envelope<unknown> | null)?.error
  if (typeof error === "string" && error) return error
  if (error && typeof error === "object" && error.message) return error.message
  return fallback
}

async function getJson<T>(path: string, fallback: string): Promise<T> {
  const response = await fetch(apiV2(path), { cache: "no-store" })
  const json = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!response.ok || json?.data === undefined) {
    throw new Error(errorFrom(json, fallback))
  }
  return json.data
}

// The list endpoints leave out winners and entry counts, so each item's
// detail is fetched alongside.
export async function fetchPrizes(filter: PrizeFilter): Promise<Prize[]> {
  const list = await getJson<Array<Omit<Prize, "winners">>>(`/prizes?filter=${filter}`, "Couldn't load prizes.")
  return Promise.all(
    list.map(async (prize) => {
      const detail = await getJson<{ winners?: PrizeWinner[] }>(`/prizes/${prize.uuid}`, "").catch(() => null)
      return { ...prize, winners: detail?.winners ?? [] }
    })
  )
}

export async function fetchGiveaways(filter: PrizeFilter): Promise<Giveaway[]> {
  const list = await getJson<Array<Omit<Giveaway, "winners" | "entry_count" | "viewer_has_joined">>>(
    `/giveaways?filter=${filter}`,
    "Couldn't load giveaways."
  )
  return Promise.all(
    list.map(async (giveaway) => {
      const detail = await getJson<{ winners?: PrizeWinner[]; entry_count?: number; viewer_has_joined?: boolean }>(
        `/giveaways/${giveaway.uuid}`,
        ""
      ).catch(() => null)
      return {
        ...giveaway,
        winners: detail?.winners ?? [],
        entry_count: detail?.entry_count ?? 0,
        viewer_has_joined: detail?.viewer_has_joined ?? false,
      }
    })
  )
}

export async function fetchPrizeCandidates(): Promise<PrizeCandidate[]> {
  return getJson<PrizeCandidate[]>("/prize-candidates", "Couldn't load the winners to confirm.")
}

export const CRITERIA_LABELS: Record<PrizeCriteriaType, string> = {
  trial_wr: "Trial WR",
  combo_wr: "Combo #1",
  rankup: "Rank up",
  score_reached: "Score goal",
}

// The one line every prize card leads with: what you have to do to win it.
export function howToWin(
  prize: Pick<Prize, "criteria_type" | "criteria_trial_name" | "criteria_combo_category_slug" | "criteria_score_target">,
  categoryLabel?: (slug: string) => string | undefined
) {
  switch (prize.criteria_type) {
    case "trial_wr":
      return prize.criteria_trial_name ? `Set a new world record on ${prize.criteria_trial_name}.` : "Set a new world record on any trial."
    case "combo_wr": {
      const slug = prize.criteria_combo_category_slug
      return slug ? `Take #1 on the ${categoryLabel?.(slug) ?? slug} combo leaderboard.` : "Take #1 on any combo leaderboard."
    }
    case "rankup":
      return "Rank up into a new tier."
    case "score_reached":
      return prize.criteria_score_target != null
        ? `Reach a score of ${Number(prize.criteria_score_target).toFixed(3)}.`
        : "Reach the target score."
  }
}

export function spotsLabel(winners: number, maxWinners: number | null) {
  if (maxWinners == null) return `${winners} ${winners === 1 ? "winner" : "winners"}, no limit`
  return `${winners} of ${maxWinners} ${maxWinners === 1 ? "spot" : "spots"} taken`
}

// "in 3 days", "2 hours ago": the countdown on a card.
export function formatUntil(unixSeconds: number, nowSeconds: number) {
  return formatRelative(unixSeconds, nowSeconds)
}

const fullDate = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

export function formatDeadline(unixSeconds: number) {
  return fullDate.format(new Date(unixSeconds * 1000))
}

// <input type="datetime-local"> values, in the viewer's timezone.
export function toDatetimeLocal(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function fromDatetimeLocal(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}
