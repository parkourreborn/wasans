import "server-only"
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

// Loads the display/permission row for a player uuid (sourced from the v2
// JWT's `sub` claim) and records the request IP.
export async function loadAuthUserByUuid(db: D1Database, playerUuid: string, request: Request) {
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
