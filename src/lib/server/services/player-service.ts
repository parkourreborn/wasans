import "server-only"
import { getPlayerByUuid, getPlayerPbs, getPlayerRank, getPlayerSubmissions } from "@/lib/server/repositories/player-repository"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"

export async function buildPlayerDetail(
  db: D1Database,
  uuid: string,
  options: { includePbs: boolean; includeRecentSubmissions: boolean; submissionsLimit: number }
) {
  await ensurePlayerAvatarColumns(db)

  const player = await getPlayerByUuid(db, uuid)

  if (!player) {
    return null
  }

  const [rank, pbs, recentSubmissions] = await Promise.all([
    getPlayerRank(db, Number(player.score || 0)),
    options.includePbs ? getPlayerPbs(db, uuid) : Promise.resolve(undefined),
    options.includeRecentSubmissions
      ? getPlayerSubmissions(db, uuid, { limit: options.submissionsLimit, offset: 0, approvedOnly: false })
      : Promise.resolve(undefined),
  ])

  return {
    ...player,
    rank,
    pbs,
    recent_submissions: recentSubmissions,
  }
}
