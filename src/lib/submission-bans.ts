export const SUBMISSION_BAN_REASON_MAX_LENGTH = 500

export type SubmissionBanSummary = {
  reason: string | null
  banned_at: number
  banned_by_name: string | null
}

// Trims a moderator-supplied ban reason down to what we store. A blank or
// whitespace-only reason becomes null so the UI falls back to the generic
// message instead of rendering an empty line after the colon.
export function normalizeSubmissionBanReason(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, SUBMISSION_BAN_REASON_MAX_LENGTH)
}

// Used by both the submission API (as the 403 body) and the New Submission
// page banner, so a banned player reads the exact same sentence either way.
export function formatSubmissionBanMessage(reason: string | null | undefined) {
  const normalized = normalizeSubmissionBanReason(reason)

  return normalized
    ? `You are banned from submitting runs: ${normalized}`
    : "You are banned from submitting runs. Contact a moderator if you think this is a mistake."
}
