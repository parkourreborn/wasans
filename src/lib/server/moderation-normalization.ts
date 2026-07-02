export function normalizeState(value: unknown) {
  if (value === "accepted") {
    return "approved"
  }

  if (value === "approved" || value === "denied" || value === "pending") {
    return value
  }

  return null
}

export function normalizeModeratorNote(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const moderatorNote = value.trim().replace(/\s+/g, " ")

  if (moderatorNote.length === 0 || moderatorNote.length > 500) {
    return null
  }

  return moderatorNote
}
