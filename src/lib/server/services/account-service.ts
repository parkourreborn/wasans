import "server-only"
import type { AuthUser } from "@/lib/server/auth"
import { deletedAccountName } from "@/lib/player-name"

export async function deactivateAccount(db: D1Database, user: AuthUser) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(
    `UPDATE players
     SET account_status = 'deactivated',
         deactivated_at = ?,
         deleted_at = NULL
     WHERE uuid = ?
       AND COALESCE(account_status, 'active') = 'active'`
  )
    .bind(now, user.uuid)
    .run()
}

export async function changePlayerName(db: D1Database, oldName: string, playerName: string) {
  const session = db.withSession("first-primary")

  await session.batch([
    session.prepare(`UPDATE players SET player_name = ? WHERE player_name = ?`).bind(playerName, oldName),
    session.prepare(`UPDATE submissions SET player_name = ? WHERE player_name = ?`).bind(playerName, oldName),
    session.prepare(`UPDATE pbs SET player_name = ? WHERE player_name = ?`).bind(playerName, oldName),
    session.prepare(`UPDATE wrs SET player_name = ? WHERE player_name = ?`).bind(playerName, oldName),
    session.prepare(`UPDATE audit_logs SET actor_name = ? WHERE actor_name = ?`).bind(playerName, oldName),
    session.prepare(`UPDATE submissions SET moderator_username = ? WHERE moderator_username = ?`).bind(playerName, oldName),
  ])
}

export async function deleteAccount(db: D1Database, user: AuthUser) {
  const now = Math.floor(Date.now() / 1000)
  const deletedPlayerId = `deleted:${user.uuid}`
  const session = db.withSession("first-primary")

  await session.batch([
    session.prepare(`DELETE FROM oauth_accounts WHERE player_uuid = ?`).bind(user.uuid),
    session.prepare(
      `UPDATE players
       SET player_id = ?,
           discord_avatar = NULL,
           discord_discriminator = NULL,
           player_name = ?,
           permission = 0,
           account_status = 'deleted',
           deactivated_at = NULL,
           deleted_at = ?,
           legal_terms_accepted_at = NULL,
           legal_privacy_accepted_at = NULL,
           legal_version = NULL
       WHERE uuid = ?`
    ).bind(deletedPlayerId, deletedAccountName, now, user.uuid),
    session.prepare(`UPDATE submissions SET player_name = ? WHERE player_uuid = ?`).bind(deletedAccountName, user.uuid),
    session.prepare(`UPDATE pbs SET player_name = ? WHERE player_uuid = ?`).bind(deletedAccountName, user.uuid),
    session.prepare(`UPDATE wrs SET player_name = ? WHERE player_uuid = ?`).bind(deletedAccountName, user.uuid),
    session.prepare(`UPDATE audit_logs SET actor_name = ? WHERE actor_uuid = ?`).bind(deletedAccountName, user.uuid),
    session.prepare(`UPDATE submissions SET moderator_username = ? WHERE moderator_username = ?`).bind(deletedAccountName, user.player_name),
  ])
}
