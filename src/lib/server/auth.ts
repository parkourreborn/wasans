import "server-only"
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"
import { trackPlayerIp } from "@/lib/server/player-ip-schema"

export type AuthUser = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  player_name: string
  score: number
  permission: number
}

type SessionRow = {
  player_uuid: string
}

function getCookie(request: Request, name: string) {
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

// Shared by v1 (session-cookie lookup) and v2 (JWT `sub` claim already gives
// the uuid) — loads the display/permission row and records the request IP.
export async function loadAuthUserByUuid(db: D1Database, playerUuid: string, request: Request) {
  await ensurePlayerAvatarColumns(db)

  const user = await db.prepare(
    `SELECT players.uuid,
            COALESCE(oauth_accounts.provider_account_id, players.player_id) AS player_id,
            players.discord_avatar,
            players.discord_discriminator,
            players.player_name,
            players.score,
            players.permission
     FROM players
     LEFT JOIN oauth_accounts
       ON oauth_accounts.player_uuid = players.uuid
       AND oauth_accounts.provider = 'discord'
     WHERE players.uuid = ?
       AND COALESCE(players.account_status, 'active') = 'active'
     ORDER BY oauth_accounts.updated_at DESC
     LIMIT 1`
  )
    .bind(playerUuid)
    .first<AuthUser>()

  if (user) {
    await trackPlayerIp(db, playerUuid, request)
  }

  return user
}

export async function getAuthUser(request: Request, db: D1Database) {
  await ensurePlayerAvatarColumns(db)

  const sessionToken = getCookie(request, "wasans_session")
  let playerUuid: string | null = null

  if (sessionToken) {
    const session = await db.prepare(
      `SELECT player_uuid
       FROM auth_sessions
       WHERE token = ? AND CAST(expires_at AS INTEGER) > ?`
    )
      .bind(sessionToken, Math.floor(Date.now() / 1000))
      .first<SessionRow>()

    playerUuid = session?.player_uuid ?? null
  }

  if (!playerUuid) {
    return null
  }

  return loadAuthUserByUuid(db, playerUuid, request)
}

// players.permission tiers: 0 = member, 1 = moderator, 2 = owner. Owners are
// moderators too (canModerate is still >= 1) but additionally get feature
// flag control (see src/lib/server/repositories/feature-flag-repository.ts).
export const PERMISSION_MODERATOR = 1
export const PERMISSION_OWNER = 2

export function canModerate(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_MODERATOR)
}

export function isOwner(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_OWNER)
}
