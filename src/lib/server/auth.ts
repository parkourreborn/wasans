import "server-only"

export type AuthUser = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
}

type SessionRow = {
  player_uuid: string
}

type DiscordAccountRow = {
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

export async function getAuthUser(request: Request, db: D1Database) {
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

  return db.prepare(
    `SELECT players.uuid,
            COALESCE(oauth_accounts.provider_account_id, players.player_id) AS player_id,
            players.player_name,
            players.score,
            players.permission
     FROM players
     LEFT JOIN oauth_accounts
       ON oauth_accounts.player_uuid = players.uuid
       AND oauth_accounts.provider = 'discord'
     WHERE players.uuid = ?
     ORDER BY oauth_accounts.updated_at DESC
     LIMIT 1`
  )
    .bind(playerUuid)
    .first<AuthUser>()
}

export function canModerate(user: AuthUser | null) {
  return Boolean(user && user.permission >= 1)
}
