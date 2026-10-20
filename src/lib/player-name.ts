export const deletedAccountName = "Deleted Account"
export const playerNameMinLength = 2
export const playerNameMaxLength = 32

export type PlayerNameValidation =
  | { ok: true; playerName: string }
  | { ok: false; message: string }

// Characters that draw nothing (zero-width spaces, Hangul fillers, the blank
// Braille cell), steer text direction, or are lone surrogate halves. A name
// carrying them could look identical to another player's while still
// counting as a different name, so they are dropped.
const invisibleCharacters = /[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}⠀]/gu

export function cleanPlayerName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(invisibleCharacters, "")
    .replace(/ +/g, " ")
    .trim()
}

// Signup (normalizeLoginPlayerName) and renaming share these rules, so a
// player can pick any name they could have signed up with.
export function validatePlayerName(value: unknown): PlayerNameValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "Enter a username." }
  }

  const playerName = cleanPlayerName(value)

  if (playerName.length < playerNameMinLength) {
    return { ok: false, message: `Username needs at least ${playerNameMinLength} characters.` }
  }

  if (playerName.length > playerNameMaxLength) {
    return { ok: false, message: `Username must be ${playerNameMaxLength} characters or less.` }
  }

  if (playerName.toLowerCase() === deletedAccountName.toLowerCase()) {
    return { ok: false, message: "That username is reserved." }
  }

  return { ok: true, playerName }
}

// The signup side of validatePlayerName. A reserved name is let through here
// because getAvailablePlayerName suffixes it, as it does a taken one.
export function normalizeLoginPlayerName(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const playerName = cleanPlayerName(value)
  if (playerName.length < playerNameMinLength || playerName.length > playerNameMaxLength) {
    return null
  }

  return playerName
}
