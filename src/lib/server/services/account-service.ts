import "server-only"
import type { AuthUser } from "@/lib/server/auth"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"
import { deletedAccountName } from "@/lib/player-name"

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie")

  if (!cookie) {
    return null
  }

  const match = cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function expiredCookie(request: Request, name: string) {
  const requestUrl = new URL(request.url)
  const isSecure = requestUrl.protocol === "https:"
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? "; Secure" : ""}`
}

export function appendExpiredAuthCookies(headers: Headers, request: Request) {
  headers.append("set-cookie", expiredCookie(request, "wasans_session"))
  headers.append("set-cookie", expiredCookie(request, "wasans_discord_oauth_state"))
  headers.append("set-cookie", expiredCookie(request, "wasans_discord_oauth_next"))
}

export async function clearCurrentSession(db: D1Database, request: Request) {
  const sessionToken = getCookie(request, "wasans_session")

  if (!sessionToken) {
    return
  }

  await db.prepare(`DELETE FROM auth_sessions WHERE token = ?`).bind(sessionToken).run()
}

export async function deactivateAccount(db: D1Database, user: AuthUser) {
  await ensurePlayerAvatarColumns(db)

  const now = String(Math.floor(Date.now() / 1000))
  const session = db.withSession("first-primary")

  await session.batch([
    session.prepare(
      `UPDATE players
       SET account_status = 'deactivated',
           deactivated_at = ?,
           deleted_at = NULL
       WHERE uuid = ?
         AND COALESCE(account_status, 'active') = 'active'`
    ).bind(now, user.uuid),
    session.prepare(`DELETE FROM auth_sessions WHERE player_uuid = ?`).bind(user.uuid),
  ])
}

export async function changePlayerName(db: D1Database, oldName: string, playerName: string) {
  await ensurePlayerAvatarColumns(db)

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
  await ensurePlayerAvatarColumns(db)

  const now = String(Math.floor(Date.now() / 1000))
  const deletedPlayerId = `deleted:${user.uuid}`
  const session = db.withSession("first-primary")

  await session.batch([
    session.prepare(`DELETE FROM auth_sessions WHERE player_uuid = ?`).bind(user.uuid),
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
