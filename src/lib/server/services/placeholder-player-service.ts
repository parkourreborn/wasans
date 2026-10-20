import "server-only"
import { buildAuditLogStatement, type AuditActor } from "@/lib/server/audit"
import { archiveRun, getWorldRecordRun } from "@/lib/server/services/wr-archive-service"
import { ApiError } from "@/lib/server/v2/http"

// Placeholders are players with no account, just a name (players.placeholder
// = 1), made for world records imported from the old WR Drive whose player
// never signed up (see wr-import-service.ts). Nobody can sign in as one, and
// they're left out of the leaderboards, the players list and site stats.

export type PlaceholderPlayer = { uuid: string; player_name: string; date_joined: number; runs: number }

// Every placeholder, by name, with how many runs it has.
export async function listPlaceholderPlayers(db: D1Database): Promise<PlaceholderPlayer[]> {
  const { results } = await db
    .prepare(
      `SELECT p.uuid, p.player_name, p.date_joined, COUNT(s.uuid) AS runs
       FROM players p
       LEFT JOIN submissions s ON s.player_uuid = p.uuid
       WHERE p.placeholder = 1
       GROUP BY p.uuid
       ORDER BY LOWER(p.player_name) ASC`
    )
    .all<PlaceholderPlayer>()
  return (results || []).map((row) => ({ ...row, runs: Number(row.runs) }))
}

// The player signed up after all: their runs move to the account, and the
// placeholder goes. Archived records are renamed, since the archive name
// carries the player's uuid.
export async function movePlaceholderRuns(env: CloudflareEnv, db: D1Database, actor: AuditActor, placeholderUuid: string, targetUuid: string) {
  const [from, to] = await Promise.all([
    db.prepare(`SELECT uuid, player_name FROM players WHERE uuid = ? AND placeholder = 1`).bind(placeholderUuid).first<{ uuid: string; player_name: string }>(),
    db
      .prepare(`SELECT uuid, player_name FROM players WHERE uuid = ? AND placeholder = 0 AND COALESCE(account_status, 'active') = 'active'`)
      .bind(targetUuid)
      .first<{ uuid: string; player_name: string }>(),
  ])
  if (!from) throw new ApiError("That player isn’t a name-only player", 404, "not_found")
  if (!to) throw new ApiError("Pick the account to move the runs to", 400, "validation_error")

  const { results } = await db.prepare(`SELECT uuid FROM submissions WHERE player_uuid = ?`).bind(from.uuid).all<{ uuid: string }>()
  const runs = (results || []).map((row) => row.uuid)

  // The runs move before the placeholder is deleted, whose foreign keys
  // would otherwise delete them with it.
  await db.batch([
    db.prepare(`UPDATE submissions SET player_uuid = ?, player_name = ? WHERE player_uuid = ?`).bind(to.uuid, to.player_name, from.uuid),
    db.prepare(`DELETE FROM players WHERE uuid = ? AND placeholder = 1`).bind(from.uuid),
    buildAuditLogStatement(db, "placeholder_runs_moved", "player", to.uuid, {
      actor,
      details: { from_uuid: from.uuid, from_name: from.player_name, to_name: to.player_name, runs: runs.length },
    }),
  ])

  // The daily archive sweep renames anything left over.
  if (env.UPLOADS && env.SUBMISSION_VIDEOS) {
    for (const uuid of runs) {
      try {
        const record = await getWorldRecordRun(db, uuid)
        if (record) await archiveRun(env, db, record)
      } catch (error) {
        console.error(`Archiving ${uuid} after moving it to ${to.uuid} failed:`, error)
      }
    }
  }
  return { moved: runs.length, player_uuid: to.uuid }
}
