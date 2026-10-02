export const deletedAccountName = "Deleted Account"
export const playerNameMaxLength = 32

export type PlayerNameValidation =
  | { ok: true; playerName: string }
  | { ok: false; message: string }

export function cleanPlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function validatePlayerName(value: unknown): PlayerNameValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "Enter a username." }
  }

  const playerName = cleanPlayerName(value)

  if (playerName.length < 3) {
    return { ok: false, message: "Username needs at least 3 characters." }
  }

  if (playerName.length > playerNameMaxLength) {
    return { ok: false, message: `Username must be ${playerNameMaxLength} characters or less.` }
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(playerName)) {
    return { ok: false, message: "Use letters, numbers, spaces, - or _." }
  }

  if (/[-_]$/.test(playerName)) {
    return { ok: false, message: "Username can't end with - or _." }
  }

  if (playerName.toLowerCase() === deletedAccountName.toLowerCase()) {
    return { ok: false, message: "That username is reserved." }
  }

  return { ok: true, playerName }
}

export function normalizeLoginPlayerName(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const playerName = cleanPlayerName(value)
  if (playerName.length < 2 || playerName.length > playerNameMaxLength) {
    return null
  }

  return playerName
}

