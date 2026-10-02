import "server-only"
import { getPlayerByUuid, getPlayerPbs, getPlayerRank, getPlayerSubmissions } from "@/lib/server/repositories/player-repository"
import { listComboPbsForPlayer } from "@/lib/server/repositories/combo-submission-repository"

export async function buildPlayerDetail(
  db: D1Database,
  uuid: string,
  options: { includePbs: boolean; includeComboPbs: boolean; includeRecentSubmissions: boolean; submissionsLimit: number }
) {
  const player = await getPlayerByUuid(db, uuid)

  if (!player) {
    return null
  }

  const [rank, pbs, comboPbs, recentSubmissions] = await Promise.all([
    getPlayerRank(db, Number(player.score || 0)),
    options.includePbs ? getPlayerPbs(db, uuid) : Promise.resolve(undefined),
    // combo_pbs is the combo analog of pbs: one row per category the player has
    // an approved submission in, already ordered by the category sort order.
    options.includeComboPbs ? listComboPbsForPlayer(db, uuid) : Promise.resolve(undefined),
    options.includeRecentSubmissions
      ? getPlayerSubmissions(db, uuid, { limit: options.submissionsLimit, offset: 0, approvedOnly: false })
      : Promise.resolve(undefined),
  ])

  return {
    ...player,
    rank,
    pbs,
    combo_pbs: comboPbs,
    recent_submissions: recentSubmissions,
  }
}
