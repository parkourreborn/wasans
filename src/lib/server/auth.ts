import "server-only"
import { trackPlayerIp } from "@/lib/server/player-ip-schema"

export type AuthUser = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
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
            players.auth_provider,
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

// players.permission tiers:
//   0 = member
//   1 = combo moderator     — combo submissions/categories only, incl. delete
//   2 = junior moderator    — everything (trials + combos), EXCEPT delete
//   3 = senior moderator    — everything (trials + combos), including delete
//   4 = owner               — everything, plus feature flag control (see
//                             src/lib/server/repositories/feature-flag-repository.ts)
//
// This is *not* a strictly-ordered "higher tier can do everything a lower
// tier can" scale for deletion: junior moderator (2) sits above combo
// moderator (1) in scope (general vs. combo-only) but below it in this one
// capability, so delete access is gated by its own functions below rather
// than a single permission >= N check.
export const PERMISSION_COMBO_MODERATOR = 1
export const PERMISSION_JUNIOR_MODERATOR = 2
export const PERMISSION_SENIOR_MODERATOR = 3
export const PERMISSION_OWNER = 4

// Gates non-delete trial-submission moderation (approve/deny/edit note/edit
// time) and other general/trial admin actions (trial retire/version-bump/
// reorder, audit log viewing). Combo-only moderators (permission ===
// PERMISSION_COMBO_MODERATOR) do not pass this — use canModerateCombo for
// combo-scoped actions instead.
export function canModerate(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_JUNIOR_MODERATOR)
}

// Gates non-delete combo-submission moderation and combo-category
// management. Anyone who can moderate in general (canModerate) can also
// moderate combos, plus combo-only moderators.
export function canModerateCombo(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_COMBO_MODERATOR)
}

// Gates deleting a trial submission. Junior moderator (2) is excluded on
// purpose — only senior moderators and owners may delete trial times.
export function canDeleteTrialSubmission(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_SENIOR_MODERATOR)
}

// Gates deleting a combo submission. Combo moderators keep full delete
// rights within their own domain even though junior moderators (2) don't.
export function canDeleteComboSubmission(user: { permission: number } | null) {
  return Boolean(
    user &&
      (user.permission === PERMISSION_COMBO_MODERATOR || user.permission >= PERMISSION_SENIOR_MODERATOR)
  )
}

export function isOwner(user: { permission: number } | null) {
  return Boolean(user && user.permission >= PERMISSION_OWNER)
}
