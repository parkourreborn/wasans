import "server-only"
import { isFeatureEnabled } from "@/lib/server/repositories/feature-flag-repository"
import { fetchRobloxUserNames } from "@/lib/server/roblox"
import { AccountLinkError, oauthProviderLabels, type OAuthProvider } from "@/lib/server/services/auth-service"

type OauthAccountRow = {
  provider: OAuthProvider
  provider_account_id: string
  username: string | null
  display_name: string | null
  created_at: number
}

export type LinkedAccount = {
  provider: OAuthProvider
  account_id: string
  username: string | null
  display_name: string | null
  linked_at: number
  is_avatar: boolean
}

export type LinkedRobloxAccount = {
  user_id: string
  username: string | null
  display_name: string | null
  profile_url: string
  linked_at: number
}

async function listOauthAccountRows(db: D1Database, playerUuid: string) {
  const { results } = await db.prepare(
    `SELECT provider, provider_account_id, username, display_name, created_at
     FROM oauth_accounts
     WHERE player_uuid = ?
     ORDER BY provider ASC, created_at ASC`
  )
    .bind(playerUuid)
    .all<OauthAccountRow>()

  return results || []
}

// Roblox names straight from Roblox where possible (display names change
// weekly, and the in-game name in a video is the display name), falling
// back to what was stored at the last login/link with that account.
async function withLiveRobloxNames(cache: KVNamespace, rows: OauthAccountRow[]) {
  const liveNames = await fetchRobloxUserNames(
    cache,
    rows.filter((row) => row.provider === "roblox").map((row) => row.provider_account_id)
  )

  return rows.map((row) => {
    const live = row.provider === "roblox" ? liveNames.get(row.provider_account_id) : undefined
    return {
      ...row,
      username: live?.username ?? row.username,
      display_name: live?.display_name ?? row.display_name,
    }
  })
}

export async function listLinkedAccounts(db: D1Database, cache: KVNamespace, playerUuid: string): Promise<LinkedAccount[]> {
  const [rows, player] = await Promise.all([
    listOauthAccountRows(db, playerUuid),
    db.prepare(`SELECT avatar_roblox_id FROM players WHERE uuid = ?`).bind(playerUuid).first<{ avatar_roblox_id: string | null }>(),
  ])

  return (await withLiveRobloxNames(cache, rows)).map((row) => ({
    provider: row.provider,
    account_id: row.provider_account_id,
    username: row.username,
    display_name: row.display_name,
    linked_at: row.created_at,
    is_avatar: row.provider === "roblox" && row.provider_account_id === player?.avatar_roblox_id,
  }))
}

// For moderators checking that the account in a submission's video is the
// submitter's own: every linked Roblox account, alts included.
export async function listLinkedRobloxAccounts(db: D1Database, cache: KVNamespace, playerUuid: string): Promise<LinkedRobloxAccount[]> {
  const rows = (await listOauthAccountRows(db, playerUuid)).filter((row) => row.provider === "roblox")

  return (await withLiveRobloxNames(cache, rows)).map((row) => ({
    user_id: row.provider_account_id,
    username: row.username,
    display_name: row.display_name,
    profile_url: `https://www.roblox.com/users/${row.provider_account_id}/profile`,
    linked_at: row.created_at,
  }))
}

export async function hasLinkedRobloxAccount(db: D1Database, playerUuid: string) {
  const row = await db.prepare(
    `SELECT 1 AS linked FROM oauth_accounts WHERE player_uuid = ? AND provider = 'roblox' LIMIT 1`
  )
    .bind(playerUuid)
    .first<{ linked: number }>()

  return Boolean(row)
}

// Removes one linked account, refusing to remove the player's last way to
// log in. All of it is one D1 batch (a transaction): the count check is
// inside the DELETE itself so two concurrent unlinks can't both pass it,
// and the players-row cleanup only applies if the link is actually gone.
export async function unlinkAccount(db: D1Database, playerUuid: string, provider: OAuthProvider, accountId: string) {
  const session = db.withSession("first-primary")
  const linkGone = `NOT EXISTS (
    SELECT 1 FROM oauth_accounts WHERE provider = ? AND provider_account_id = ? AND player_uuid = ?
  )`

  const [deleted] = await session.batch([
    session.prepare(
      `DELETE FROM oauth_accounts
       WHERE provider = ?
         AND provider_account_id = ?
         AND player_uuid = ?
         AND (SELECT COUNT(*) FROM oauth_accounts WHERE player_uuid = ?) > 1`
    )
      .bind(provider, accountId, playerUuid, playerUuid),
    session.prepare(
      `UPDATE players
       SET discord_id = NULL, discord_avatar = NULL, discord_discriminator = NULL
       WHERE uuid = ? AND discord_id = ? AND ? = 'discord' AND ${linkGone}`
    )
      .bind(playerUuid, accountId, provider, provider, accountId, playerUuid),
    // Unlinking the avatar's account moves the avatar to the player's
    // oldest remaining Roblox account, or clears it if there is none.
    session.prepare(
      `UPDATE players
       SET avatar_roblox_id = (
         SELECT provider_account_id FROM oauth_accounts
         WHERE player_uuid = ? AND provider = 'roblox'
         ORDER BY created_at ASC
         LIMIT 1
       )
       WHERE uuid = ? AND avatar_roblox_id = ? AND ? = 'roblox' AND ${linkGone}`
    )
      .bind(playerUuid, playerUuid, accountId, provider, provider, accountId, playerUuid),
  ])

  if (deleted?.meta?.changes) {
    return
  }

  const stillLinked = await session.prepare(
    `SELECT 1 AS linked FROM oauth_accounts WHERE provider = ? AND provider_account_id = ? AND player_uuid = ?`
  )
    .bind(provider, accountId, playerUuid)
    .first<{ linked: number }>()

  if (stillLinked) {
    throw new AccountLinkError(
      `You can't unlink your only login method. Link another account first, then unlink this ${oauthProviderLabels[provider]} account.`
    )
  }

  throw new AccountLinkError(`That ${oauthProviderLabels[provider]} account isn't linked to your account.`)
}

export async function setAvatarRobloxAccount(db: D1Database, playerUuid: string, robloxUserId: string) {
  const result = await db.prepare(
    `UPDATE players
     SET avatar_roblox_id = ?
     WHERE uuid = ?
       AND EXISTS (
         SELECT 1 FROM oauth_accounts
         WHERE player_uuid = players.uuid AND provider = 'roblox' AND provider_account_id = ?
       )`
  )
    .bind(robloxUserId, playerUuid, robloxUserId)
    .run()

  if (!result.meta?.changes) {
    throw new AccountLinkError("That Roblox account isn't linked to your account.")
  }
}

export { robloxLinkRequiredMessage } from "@/lib/linked-accounts"

// True when the require_roblox_link flag is on and this player has no
// Roblox account linked: they may not submit or upload.
export async function isMissingRequiredRobloxLink(db: D1Database, playerUuid: string) {
  if (!(await isFeatureEnabled(db, "require_roblox_link"))) {
    return false
  }

  return !(await hasLinkedRobloxAccount(db, playerUuid))
}
