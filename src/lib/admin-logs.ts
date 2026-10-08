// How the admin Logs page buckets audit actions. Shared by the API (which
// filters and counts by bucket) and the page (which labels rows).

export type LogBucket = "all" | "errors" | "moderation" | "admin" | "activity"

export const LOG_BUCKETS: Array<{ key: LogBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "errors", label: "Errors" },
  { key: "moderation", label: "Moderation" },
  { key: "admin", label: "Admin" },
  { key: "activity", label: "Activity" },
]

export const ERROR_ACTIONS = ["site_error"] as const

export const MODERATION_ACTIONS = [
  "submission_updated",
  "submission_approved",
  "submission_denied",
  "submission_deleted",
  "submission_original_downloaded",
  "combo_submission_updated",
  "combo_submission_approved",
  "combo_submission_denied",
  "combo_submission_deleted",
] as const

export const ADMIN_ACTIONS = [
  "trial_created",
  "trial_retired",
  "trial_unretired",
  "trial_version_bumped",
  "trial_version_unbumped",
  "trial_reordered",
  "combo_category_created",
  "combo_category_updated",
  "feature_flag_changed",
  "player_permission_changed",
  "player_submission_banned",
  "player_submission_unbanned",
  "announcement_created",
  "announcement_deleted",
  "prize_created",
  "prize_closed",
  "prize_deadline_extended",
  "prize_winner_added",
  "prize_winner_removed",
  "prize_candidate_confirmed",
  "prize_candidate_rejected",
  "giveaway_created",
  "giveaway_closed",
  "giveaway_deadline_extended",
  "giveaway_drawn",
  "giveaway_rerolled",
  "wr_compilation_started",
  "video_backfill_started",
  "scores_recalculated",
  "analytics_backfilled",
  "duplicates_removed",
] as const

// Everything else lands in "activity": runs and combos being submitted, WRs
// changing hands, prizes being claimed, sign-in refresh failures.

export function bucketForAction(action: string): Exclude<LogBucket, "all"> {
  if ((ERROR_ACTIONS as readonly string[]).includes(action)) return "errors"
  if ((MODERATION_ACTIONS as readonly string[]).includes(action)) return "moderation"
  if ((ADMIN_ACTIONS as readonly string[]).includes(action)) return "admin"
  return "activity"
}

export const PERMISSION_NAMES = ["Player", "Combo mod", "Junior mod", "Senior mod", "Owner"] as const

export function permissionName(level: number) {
  return PERMISSION_NAMES[level] ?? `Level ${level}`
}

export type LogRow = {
  id: number
  created_at: number
  actor_uuid: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_uuid: string | null
  target_type: string | null
  target_uuid: string | null
  details: string | null
  group_count?: number
  first_at?: number
  subject_player_name?: string | null
  subject_time?: number | null
  subject_combo_count?: number | null
}

export type LogDetails = Record<string, unknown>

export function parseLogDetails(row: Pick<LogRow, "details">): LogDetails {
  if (!row.details) return {}
  try {
    const value = JSON.parse(row.details)
    return value && typeof value === "object" ? (value as LogDetails) : {}
  } catch {
    return {}
  }
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
const time = (value: unknown) => (num(value) === null ? null : (value as number).toFixed(3))

function runLabel(row: LogRow, details: LogDetails) {
  const trial = str(details.trial_name)
  const t = row.subject_time ?? num(details.time)
  const owner = row.subject_player_name ?? str(details.player_name)
  const parts = [trial, t === null ? null : t.toFixed(3)].filter(Boolean).join(" ")
  return [parts || "a run", owner ? `by ${owner}` : null].filter(Boolean).join(" ")
}

function comboLabel(row: LogRow, details: LogDetails) {
  const category = str(details.category_slug)
  const count = row.subject_combo_count ?? num(details.combo_count)
  const owner = row.subject_player_name
  return [category ? `${category} combo` : "a combo", count === null ? null : `×${count}`, owner ? `by ${owner}` : null]
    .filter(Boolean)
    .join(" ")
}

// A short tag and a sentence for one log row. Unknown actions fall back to
// the raw action name, so nothing is ever hidden.
export function describeLog(row: LogRow): { tag: string; tone: "error" | "good" | "bad" | "info" | "admin" | "muted"; text: string; meta: string | null } {
  const d = parseLogDetails(row)
  const who = row.actor_name || "System"
  const note = str(d.moderator_note)

  switch (row.action) {
    case "site_error": {
      const source = str(d.source)
      const crash = source === "client" || source === "client_console"
      return {
        tag: crash ? "Page crash" : "Server error",
        tone: "error",
        text: str(d.message) || "Unknown error",
        meta: [str(d.path), str(d.method) && d.method !== "CLIENT" ? str(d.method) : null, row.actor_name ? `signed in as ${row.actor_name}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      }
    }
    case "submission_approved":
      return { tag: "Approved", tone: "good", text: `${who} approved ${runLabel(row, d)}`, meta: note }
    case "submission_denied":
      return { tag: "Denied", tone: "bad", text: `${who} denied ${runLabel(row, d)}`, meta: note }
    case "submission_updated": {
      const oldT = time(d.old_time)
      const newT = time(d.new_time)
      if (oldT && newT) {
        return { tag: "Time edited", tone: "info", text: `${who} changed ${str(d.trial_name) ?? "a run"} ${oldT} to ${newT}`, meta: note }
      }
      return { tag: "Edited", tone: "info", text: `${who} edited ${runLabel(row, d)}`, meta: note }
    }
    case "submission_deleted":
      return {
        tag: "Deleted",
        tone: "bad",
        text: d.reason === "duplicate_removal" ? `${who} removed a duplicate ${str(d.trial_name) ?? ""} run`.replace("  ", " ") : `${who} deleted ${runLabel(row, d)}`,
        meta: null,
      }
    case "submission_original_downloaded":
      return { tag: "Download", tone: "muted", text: `${who} downloaded the original video for ${runLabel(row, d)}`, meta: null }
    case "combo_submission_approved":
      return { tag: "Approved", tone: "good", text: `${who} approved ${comboLabel(row, d)}`, meta: note }
    case "combo_submission_denied":
      return { tag: "Denied", tone: "bad", text: `${who} denied ${comboLabel(row, d)}`, meta: note }
    case "combo_submission_updated":
      return { tag: "Edited", tone: "info", text: `${who} edited ${comboLabel(row, d)}`, meta: note }
    case "combo_submission_deleted":
      return { tag: "Deleted", tone: "bad", text: `${who} deleted ${comboLabel(row, d)}`, meta: null }
    case "submission_created":
      return { tag: "Submitted", tone: "muted", text: `${who} submitted ${str(d.trial_name) ?? "a run"} ${time(d.time) ?? ""}`.trim(), meta: null }
    case "combo_submission_created":
      return { tag: "Submitted", tone: "muted", text: `${who} submitted ${comboLabel(row, d)}`, meta: null }
    case "wr_created":
    case "wr_changed":
      return { tag: "New WR", tone: "admin", text: `${str(d.player_name) ?? "Someone"} holds the ${str(d.trial_name) ?? ""} WR with ${time(d.time) ?? "?"}`, meta: null }
    case "wr_deleted":
      return { tag: "WR removed", tone: "muted", text: `The ${str(d.trial_name) ?? ""} WR by ${str(d.player_name) ?? "someone"} was removed`, meta: null }
    case "player_permission_changed": {
      const target = str(d.target_player_name) ?? "a player"
      const from = num(d.old_permission)
      const to = num(d.new_permission)
      return {
        tag: "Permission",
        tone: "admin",
        text: `${who} made ${target} ${to === null ? "something else" : withArticle(permissionName(to))}`,
        meta: from === null || to === null ? null : `${permissionName(from)} → ${permissionName(to)}`,
      }
    }
    case "player_submission_banned":
      return { tag: "Ban", tone: "bad", text: `${who} banned ${str(d.target_player_name) ?? "a player"} from submitting`, meta: str(d.reason) }
    case "player_submission_unbanned":
      return { tag: "Unban", tone: "good", text: `${who} lifted ${str(d.target_player_name) ?? "a player"}’s submission ban`, meta: null }
    case "feature_flag_changed":
      return { tag: "Switch", tone: "admin", text: `${who} turned ${d.enabled ? "on" : "off"} ${flagName(str(d.key))}`, meta: null }
    case "trial_created":
      return { tag: "Trial", tone: "admin", text: `${who} added ${str(d.trial_name) ?? row.entity_uuid}`, meta: "Counts toward scores in 7 days" }
    case "trial_retired":
      return { tag: "Trial", tone: "admin", text: `${who} retired ${str(d.trial_name) ?? row.entity_uuid}`, meta: "Leaves scores in 7 days" }
    case "trial_unretired":
      return { tag: "Trial", tone: "admin", text: `${who} brought back ${str(d.trial_name) ?? row.entity_uuid}`, meta: null }
    case "trial_version_bumped":
      return { tag: "Trial", tone: "admin", text: `${who} marked ${str(d.trial_name) ?? row.entity_uuid} as changed`, meta: "Older runs stop counting in 7 days" }
    case "trial_version_unbumped":
      return { tag: "Trial", tone: "admin", text: `${who} undid the version change on ${str(d.trial_name) ?? row.entity_uuid}`, meta: null }
    case "trial_reordered":
      return { tag: "Trial", tone: "admin", text: `${who} reordered the trials`, meta: null }
    case "combo_category_created":
      return { tag: "Category", tone: "admin", text: `${who} added the ${str(d.label) ?? str(d.slug)} combo category`, meta: null }
    case "combo_category_updated":
      return {
        tag: "Category",
        tone: "admin",
        text: Array.isArray(d.reordered)
          ? `${who} reordered the combo categories`
          : `${who} updated the ${str(d.slug) ?? ""} combo category`.replace("  ", " "),
        meta: [str(d.label) ? `Label: ${d.label}` : null, str(d.status) ? (d.status === "active" ? "Turned on" : "Turned off") : null].filter(Boolean).join(" · ") || null,
      }
    case "announcement_created":
      return { tag: "Notice", tone: "admin", text: `${who} posted an announcement`, meta: str(d.body) }
    case "announcement_deleted":
      return { tag: "Notice", tone: "admin", text: `${who} removed an announcement`, meta: null }
    case "scores_recalculated":
      return { tag: "Maintenance", tone: "admin", text: `${who} recalculated every score`, meta: null }
    case "duplicates_removed":
      return { tag: "Maintenance", tone: "admin", text: `${who} removed duplicate submissions`, meta: `${num(d.deleted_count) ?? 0} removed` }
    case "analytics_backfilled":
      return { tag: "Maintenance", tone: "admin", text: `${who} backfilled analytics history`, meta: null }
    case "video_backfill_started":
      return { tag: "Maintenance", tone: "admin", text: `${who} started re-encoding old videos`, meta: null }
    case "wr_compilation_started":
      return { tag: "Compilation", tone: "admin", text: `${who} started a WR compilation`, meta: null }
    case "auth_refresh_failed":
      return { tag: "Sign-in", tone: "muted", text: "A session couldn’t be refreshed", meta: str(d.reason) ?? str(d.user_agent) }
    default: {
      const words = row.action.replaceAll("_", " ")
      const label = words.charAt(0).toUpperCase() + words.slice(1)
      const tag = label.split(" ")[0]
      return { tag, tone: row.action.startsWith("prize") || row.action.startsWith("giveaway") ? "admin" : "muted", text: `${who}: ${words}`, meta: str(d.title) }
    }
  }
}

function withArticle(name: string) {
  return /^[AEIOU]/.test(name) ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`
}

const FLAG_NAMES: Record<string, string> = {
  submissions_enabled: "trial submissions",
  combo_submissions_enabled: "combo submissions",
  moderation_enabled: "moderation",
  require_roblox_link: "the Roblox link requirement",
}

export function flagName(key: string | null) {
  return key ? FLAG_NAMES[key] ?? key.replaceAll("_", " ") : "a switch"
}
