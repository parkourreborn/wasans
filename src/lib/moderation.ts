import { apiV2 } from "@/lib/api"
import { getSubmissionErrorMessage } from "@/lib/submission-errors"
import { invalidateApi } from "@/hooks/use-api"

// Client side of moderating runs: the shapes the run endpoints return, the
// calls that change them, and the deny reasons moderators pick from.

export type RunKind = "trial" | "combo"

type PlayerAvatarFields = {
  player_id?: string | null
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
  has_roblox_avatar?: number | null
}

export type TrialRun = PlayerAvatarFields & {
  uuid: string
  player_uuid: string
  player_name: string
  player_score?: number | null
  trial_name: string
  time: number | string
  date: number
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
  video_status?: "processing" | "ready" | "failed" | null
  video_error?: string | null
  video_source_type?: "upload" | "medal" | null
  video_source_ref?: string | null
  original_key?: string | null
}

export type ComboRun = PlayerAvatarFields & {
  uuid: string
  player_uuid: string
  player_name: string
  category_slug: string
  category_label?: string | null
  combo_count: number
  youtube_url: string
  date: number
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
}

export type RunResponse<T> = { data?: { results?: T[] } }
export type RunListResponse<T> = { data?: T[]; meta?: { page?: number; limit?: number; count?: number } }

export type ModerationPatch = {
  state?: "approved" | "denied" | "pending"
  moderator_note?: string
  time?: string
}

// The server keeps notes to 500 characters after collapsing whitespace.
export const MODERATOR_NOTE_MAX = 500

function runUrl(kind: RunKind, uuid: string) {
  return apiV2(`/${kind === "trial" ? "submissions" : "combo-submissions"}/${encodeURIComponent(uuid)}`)
}

// Anything that lists, counts or scores runs can be stale after a change.
export function refreshRunCaches(kind: RunKind) {
  invalidateApi(apiV2(kind === "trial" ? "/submissions" : "/combo-submissions"))
  invalidateApi(apiV2("/players"))
  invalidateApi(apiV2("/leaderboards"))
  invalidateApi(apiV2("/records"))
}

// `keepalive` lets a change that was waiting on its undo window still go
// out when the page is closing.
export async function patchRun<T>(kind: RunKind, uuid: string, patch: ModerationPatch, options: { keepalive?: boolean } = {}) {
  const response = await fetch(runUrl(kind, uuid), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
    keepalive: options.keepalive,
  })
  const json = (await response.json().catch(() => null)) as (RunResponse<T> & { error?: { message?: string } }) | null
  if (!response.ok) {
    throw new Error(getSubmissionErrorMessage(json?.error, "Couldn't save that change"))
  }
  refreshRunCaches(kind)
  return json?.data?.results?.[0] ?? null
}

export async function deleteRun(kind: RunKind, uuid: string) {
  const response = await fetch(runUrl(kind, uuid), { method: "DELETE" })
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!response.ok) {
    throw new Error(getSubmissionErrorMessage(json?.error, "Couldn't delete the run"))
  }
  refreshRunCaches(kind)
}

// Who can do what, mirroring lib/server/auth.ts. The server checks again.
export function canModerateKind(kind: RunKind, permission: number) {
  return kind === "trial" ? permission >= 2 : permission >= 1
}

export function canDeleteRun(kind: RunKind, permission: number, isOwnRun: boolean) {
  if (isOwnRun) return true
  return kind === "trial" ? permission >= 3 : permission === 1 || permission >= 3
}

// Deny reasons, taken from the rules page so a denial points at the rule it
// broke. Moderators can pick several and add their own words.
export const DENY_REASONS: Record<RunKind, readonly string[]> = {
  trial: [
    "Banned glitch used",
    "Autoparkour or autotransition used",
    "The clip doesn't show the whole run and the final time",
    "Timer, username or build number isn't visible",
    "Hudzell pain line isn't visible",
    "The time entered doesn't match the video",
    "An overlay covers the footage",
    "Practice mode",
    "Video quality is too low to verify",
    "Duplicate submission",
  ],
  combo: [
    "The clip doesn't start from 0 combo",
    "Username isn't visible",
    "The final combo count isn't shown in chat or on the profile",
    "Under 100k score",
    "Longer than 25 minutes",
    "Banned glitch used",
    "An overlay covers the footage",
    "Video quality is too low to verify",
    "Duplicate submission",
  ],
}

// "Banned glitch used. Practice mode. <their words>"
export function composeDenyNote(reasons: readonly string[], extra: string) {
  const parts = reasons.map((reason) => reason.replace(/[.\s]+$/, ""))
  const text = extra.trim().replace(/\s+/g, " ")
  if (text) parts.push(text.replace(/[.\s]+$/, ""))
  return parts.length ? `${parts.join(". ")}.` : ""
}

// The ordered list of runs the run page's previous/next arrows step through,
// written by whichever list the moderator came from.
export const RUN_LIST_KEY = "submission_uuids"

export function rememberRunList(uuids: readonly string[]) {
  try {
    window.localStorage.setItem(RUN_LIST_KEY, JSON.stringify(uuids.slice(0, 200)))
  } catch {
    // Private mode or storage full: the arrows just won't show.
  }
}
