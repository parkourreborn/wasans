import "server-only"
import { deletedAccountName, playerNameMaxLength } from "@/lib/player-name"

// A placeholder (a player with no account) never holds its name: the real
// player can sign up with it, and an owner then moves the runs over.
export async function isPlayerNameTaken(db: D1Database, playerName: string, exceptUuid?: string) {
  const row = await db.prepare(
    `SELECT uuid
     FROM players
     WHERE LOWER(player_name) = LOWER(?)
       AND COALESCE(account_status, 'active') != 'deleted'
       AND placeholder = 0
       AND (? IS NULL OR uuid != ?)
     LIMIT 1`
  )
    .bind(playerName, exceptUuid || null, exceptUuid || null)
    .first<{ uuid: string }>()

  return Boolean(row)
}

export async function getAvailablePlayerName(db: D1Database, playerName: string, exceptUuid?: string) {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? "" : String(index)
    const base = suffix ? playerName.slice(0, playerNameMaxLength - suffix.length) : playerName
    const candidate = `${base}${suffix}`

    if (candidate.toLowerCase() === deletedAccountName.toLowerCase()) {
      continue
    }

    if (!(await isPlayerNameTaken(db, candidate, exceptUuid))) {
      return candidate
    }
  }

  throw new Error("Unable to find an available username")
}
