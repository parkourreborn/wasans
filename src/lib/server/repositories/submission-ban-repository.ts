import "server-only"
import { normalizeSubmissionBanReason } from "@/lib/submission-bans"

export type SubmissionBanRow = {
  player_uuid: string
  reason: string | null
  banned_at: number
  banned_by_uuid: string | null
  banned_by_name: string | null
}

export type SubmissionBanListRow = SubmissionBanRow & {
  player_name: string
}

// Fails open (treats the player as not banned) if the table is missing —
// e.g. before 0005_submission_bans.sql has been applied — so a lagging
// migration can never reject every submission on the site.
export async function getSubmissionBan(db: D1Database, playerUuid: string) {
  try {
    return await db.prepare(
      `SELECT player_uuid, reason, banned_at, banned_by_uuid, banned_by_name
       FROM submission_bans
       WHERE player_uuid = ?`
    )
      .bind(playerUuid)
      .first<SubmissionBanRow>()
  } catch {
    return null
  }
}

export async function listSubmissionBans(db: D1Database): Promise<SubmissionBanListRow[]> {
  const { results } = await db.prepare(
    `SELECT submission_bans.player_uuid,
            submission_bans.reason,
            submission_bans.banned_at,
            submission_bans.banned_by_uuid,
            submission_bans.banned_by_name,
            COALESCE(players.player_name, submission_bans.player_uuid) AS player_name
     FROM submission_bans
     LEFT JOIN players ON players.uuid = submission_bans.player_uuid
     ORDER BY submission_bans.banned_at DESC`
  ).all<SubmissionBanListRow>()

  return results || []
}

// Re-banning an already-banned player overwrites the reason and re-stamps who
// did it, so the row always reflects the ban that is currently in force.
export async function banPlayerFromSubmitting(
  db: D1Database,
  input: {
    playerUuid: string
    reason: string | null
    actor: { uuid: string; player_name: string }
    now: number
  }
) {
  const reason = normalizeSubmissionBanReason(input.reason)

  await db.prepare(
    `INSERT INTO submission_bans (player_uuid, reason, banned_at, banned_by_uuid, banned_by_name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(player_uuid) DO UPDATE SET
       reason = excluded.reason,
       banned_at = excluded.banned_at,
       banned_by_uuid = excluded.banned_by_uuid,
       banned_by_name = excluded.banned_by_name`
  )
    .bind(input.playerUuid, reason, input.now, input.actor.uuid, input.actor.player_name)
    .run()

  return reason
}

export async function unbanPlayerFromSubmitting(db: D1Database, playerUuid: string) {
  const result = await db.prepare(`DELETE FROM submission_bans WHERE player_uuid = ?`).bind(playerUuid).run()
  return Number(result.meta?.changes ?? 0) > 0
}
