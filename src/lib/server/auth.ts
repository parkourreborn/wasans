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
//
// `readFromPrimary` forces the lookup past D1's read replicas. Callers that
// only render a page can tolerate a replica that is a moment behind; the
// token-refresh path cannot, because there a missing row is read as "this
// account is gone" and signs the player out.
export async function loadAuthUserByUuid(
  db: D1Database,
  playerUuid: string,
  request: Request,
  options?: { readFromPrimary?: boolean }
) {
  const reader = options?.readFromPrimary ? db.withSession("first-primary") : db

  const user = await reader.prepare(
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

// players.permission tiers: 0 = member, 1 = combo moderator, 2 = moderator
// (general — trials and combos both), 3 = owner. Each tier includes every
// ability of the tiers below it: a general moderator can also do everything
// a combo moderator can, and an owner can do everything a general moderator
// can, plus feature flag control (see
// src/lib/server/repositories/feature-flag-repository.ts).
export const PERMISSION_COMBO_MODERATOR = 1
export const PERMISSION_MODERATOR = 2
export const PERMISSION_OWNER = 3

// Gates trial-submission moderation and other general/trial admin actions.
// Combo-only moderators (permission === PERMISSION_COMBO_MODERATOR) do not
// pass this — use canModerateCombo for combo-scoped actions instead.
export function canModerate(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_MODERATOR)
}

// Gates combo-submission moderation and combo-category management. Anyone
// who can moderate in general (canModerate) can also moderate combos.
export function canModerateCombo(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_COMBO_MODERATOR)
}

export function isOwner(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_OWNER)
}
