import "server-only"
import { getSafeNextUrl } from "@/lib/safe-redirect"
import { getAvailablePlayerName } from "@/lib/server/player-name-service"
import { legalVersion } from "@/lib/legal"
import { normalizeLoginPlayerName } from "@/lib/player-name"
import { generateUUID } from "@/lib/utils"
import type { RobloxUserInfo } from "@/lib/server/roblox"

type DiscordTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

export type DiscordUserResponse = {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
  discriminator?: string | null
}

type PlayerAuthRow = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  player_name: string
  score: number
  permission: number
}

type GoogleTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

// Only sub/name/given_name are ever read off Google's response. email,
// picture, locale, etc. are deliberately left untyped so nothing downstream
// can accidentally read or persist them.
export type GoogleUserResponse = {
  sub: string
  name?: string | null
  given_name?: string | null
}

const discordTokenUrl = "https://discord.com/api/oauth2/token"
const discordMeUrl = "https://discord.com/api/users/@me"
const googleTokenUrl = "https://oauth2.googleapis.com/token"
const googleUserInfoUrl = "https://openidconnect.googleapis.com/v1/userinfo"

export { getSafeNextUrl }

export function redirectWithAuthError(requestUrl: URL, message: string) {
  const nextUrl = new URL("/", requestUrl.origin)
  nextUrl.searchParams.set("auth_error", message)
  return Response.redirect(nextUrl, 302)
}

export async function exchangeCodeForToken(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(discordTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  })

  if (!response.ok) {
    throw new Error("Discord token exchange failed")
  }

  return response.json() as Promise<DiscordTokenResponse>
}

export async function getDiscordUser(accessToken: string, tokenType: string) {
  const response = await fetch(discordMeUrl, {
    headers: {
      authorization: `${tokenType} ${accessToken}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Unable to load Discord user")
  }

  return response.json() as Promise<DiscordUserResponse>
}

export async function exchangeGoogleCodeForToken(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  })

  if (!response.ok) {
    throw new Error("Google token exchange failed")
  }

  return response.json() as Promise<GoogleTokenResponse>
}

export async function getGoogleUser(accessToken: string, tokenType: string) {
  const response = await fetch(googleUserInfoUrl, {
    headers: {
      authorization: `${tokenType} ${accessToken}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Unable to load Google user")
  }

  return response.json() as Promise<GoogleUserResponse>
}

// A D1 database or a D1 session (withSession) — anything that can prepare.
type Queryable = Pick<D1Database, "prepare">

export type OAuthProvider = "discord" | "google" | "roblox"

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["discord", "google", "roblox"]

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  discord: "Discord",
  google: "Google",
  roblox: "Roblox",
}

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

// Discord and Google are one-per-player (enforced by
// idx_oauth_accounts_one_per_provider too); Roblox is unlimited, since alts
// are allowed and every account a player submits on must be linkable.
export function isSingleAccountProvider(provider: OAuthProvider) {
  return provider !== "roblox"
}

// One provider account, as read off that provider during an OAuth callback.
export type OAuthIdentity = {
  provider: OAuthProvider
  accountId: string
  // Starting player name if this identity creates a new account.
  nameHint: string | null
  // Discord only.
  discordAvatar?: string | null
  discordDiscriminator?: string | null
  // Roblox only: stored so moderators have a fallback when Roblox's live
  // lookup is unavailable.
  username?: string | null
  displayName?: string | null
}

export function discordIdentity(user: DiscordUserResponse): OAuthIdentity {
  return {
    provider: "discord",
    accountId: user.id,
    nameHint: user.global_name || user.username,
    discordAvatar: user.avatar || null,
    discordDiscriminator: user.discriminator || null,
  }
}

export function googleIdentity(user: GoogleUserResponse): OAuthIdentity {
  return {
    provider: "google",
    accountId: user.sub,
    nameHint: user.name || user.given_name || null,
  }
}

export function robloxIdentity(user: RobloxUserInfo): OAuthIdentity {
  const displayName = user.name || user.nickname || null
  const username = user.preferred_username || null

  return {
    provider: "roblox",
    accountId: user.sub,
    nameHint: displayName || username,
    username,
    displayName,
  }
}

function upsertOauthAccountStatement(db: Queryable, identity: OAuthIdentity, playerUuid: string, now: number) {
  return db.prepare(
    `INSERT INTO oauth_accounts (
      provider, provider_account_id, player_uuid, created_at, updated_at, username, display_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_account_id) DO UPDATE SET
      player_uuid = excluded.player_uuid,
      updated_at = excluded.updated_at,
      username = excluded.username,
      display_name = excluded.display_name`
  )
    .bind(identity.provider, identity.accountId, playerUuid, now, now, identity.username ?? null, identity.displayName ?? null)
}

// The players-row side of having this identity linked: Discord drives the
// avatar fallback and the bot's DMs, and a player's first Roblox account
// becomes their avatar until they pick another.
function applyIdentityToPlayerStatement(db: Queryable, identity: OAuthIdentity, playerUuid: string) {
  if (identity.provider === "discord") {
    return db.prepare(
      `UPDATE players SET discord_id = ?, discord_avatar = ?, discord_discriminator = ? WHERE uuid = ?`
    )
      .bind(identity.accountId, identity.discordAvatar ?? null, identity.discordDiscriminator ?? null, playerUuid)
  }

  if (identity.provider === "roblox") {
    return db.prepare(`UPDATE players SET avatar_roblox_id = COALESCE(avatar_roblox_id, ?) WHERE uuid = ?`)
      .bind(identity.accountId, playerUuid)
  }

  return null
}

const playerAuthColumns = `players.uuid, players.player_id, players.discord_avatar, players.discord_discriminator, players.player_name, players.score, players.permission`

async function findPlayerByIdentity(db: Queryable, identity: OAuthIdentity) {
  const linkedPlayer = await db.prepare(
    `SELECT ${playerAuthColumns}
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = ?
       AND oauth_accounts.provider_account_id = ?
       AND COALESCE(players.account_status, 'active') != 'deleted'`
  )
    .bind(identity.provider, identity.accountId)
    .first<PlayerAuthRow>()

  if (linkedPlayer || identity.provider !== "discord") {
    return linkedPlayer
  }

  // Discord only: player rows created before oauth_accounts existed carry
  // their Discord id in player_id with no link row. Google and Roblox have
  // no such legacy data, and matching their ids against player_id would
  // risk landing on an unrelated player. The NOT EXISTS keeps a player who
  // has since linked other accounts (and maybe unlinked this Discord) from
  // being matched by a player_id that no longer means anything.
  return db.prepare(
    `SELECT ${playerAuthColumns}
     FROM players
     WHERE players.player_id = ?
       AND players.auth_provider = 'discord'
       AND COALESCE(players.account_status, 'active') != 'deleted'
       AND NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE oauth_accounts.player_uuid = players.uuid)`
  )
    .bind(identity.accountId)
    .first<PlayerAuthRow>()
}

// Login with any linked account, creating a new player the first time an
// unlinked account logs in.
//
// Provider access/refresh tokens are deliberately NOT persisted. The only
// thing this app ever needs them for is the one profile call during login,
// which has already happened by the time we get here, so keeping them
// would buy nothing and turn any future database disclosure into a handout
// of live credentials for every player.
export async function findOrCreatePlayerForIdentity(db: D1Database, identity: OAuthIdentity) {
  const player = await findPlayerByIdentity(db, identity)
  const now = Math.floor(Date.now() / 1000)

  if (!player) {
    const basePlayerName = normalizeLoginPlayerName(identity.nameHint)
    if (!basePlayerName) {
      throw new Error(`${oauthProviderLabels[identity.provider]} display name is not valid`)
    }
    const playerName = await getAvailablePlayerName(db, basePlayerName)
    const playerUuid = generateUUID()
    // player_id is returned by the public API, so a Roblox signup must not
    // put its Roblox id there: linked Roblox accounts are visible only to
    // the player and moderators. Nothing reads player_id for Roblox.
    const playerId = identity.provider === "roblox" ? playerUuid : identity.accountId
    const discordId = identity.provider === "discord" ? identity.accountId : null
    const discordAvatar = identity.provider === "discord" ? identity.discordAvatar ?? null : null
    const discordDiscriminator = identity.provider === "discord" ? identity.discordDiscriminator ?? null : null

    // The player row and its oauth link are independent writes (the oauth
    // row uses the client-generated playerUuid, not anything the INSERT
    // returns), so they go in one D1 batch instead of two round trips.
    await db.batch([
      db.prepare(
        `INSERT INTO players (
          uuid, player_id, discord_avatar, discord_discriminator, player_name, date_joined, permission,
          account_status, legal_terms_accepted_at, legal_privacy_accepted_at, legal_version, auth_provider,
          discord_id, avatar_roblox_id
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          playerUuid, playerId, discordAvatar, discordDiscriminator, playerName, now, 0,
          "active", now, now, legalVersion, identity.provider,
          discordId, identity.provider === "roblox" ? identity.accountId : null
        ),
      upsertOauthAccountStatement(db, identity, playerUuid, now),
    ])

    return {
      uuid: playerUuid,
      player_id: playerId,
      discord_avatar: discordAvatar,
      discord_discriminator: discordDiscriminator,
      player_name: playerName,
      score: 0,
      permission: 0,
    }
  }

  const playerStatement = applyIdentityToPlayerStatement(db, identity, player.uuid)

  await db.batch([
    db.prepare(
      `UPDATE players
       SET account_status = 'active',
           deactivated_at = NULL,
           deleted_at = NULL,
           legal_terms_accepted_at = ?,
           legal_privacy_accepted_at = ?,
           legal_version = ?
       WHERE uuid = ?`
    )
      .bind(now, now, legalVersion, player.uuid),
    upsertOauthAccountStatement(db, identity, player.uuid, now),
    ...(playerStatement ? [playerStatement] : []),
  ])

  if (identity.provider === "discord") {
    player.discord_avatar = identity.discordAvatar ?? null
    player.discord_discriminator = identity.discordDiscriminator ?? null
  }

  return player
}

// A linking failure the player can act on; its message is shown to them.
export class AccountLinkError extends Error {}

function alreadyLinkedElsewhereError(provider: OAuthProvider) {
  const label = oauthProviderLabels[provider]
  return new AccountLinkError(
    `This ${label} account is already linked to a different wasans account. Log in with it and unlink it there first.`
  )
}

// Links a provider account to an existing, signed-in player. Never moves a
// link off another player, and never merges accounts.
export async function linkIdentityToPlayer(db: D1Database, playerUuid: string, identity: OAuthIdentity) {
  const label = oauthProviderLabels[identity.provider]
  const session = db.withSession("first-primary")

  // The flow was started by a signed-in player, but up to ten minutes ago.
  const target = await session.prepare(`SELECT account_status FROM players WHERE uuid = ?`)
    .bind(playerUuid)
    .first<{ account_status: string | null }>()
  if (!target || (target.account_status || "active") !== "active") {
    throw new AccountLinkError("Your account is not active. Log in again and retry.")
  }

  const existingOwner = await findPlayerByIdentity(session, identity)

  if (existingOwner && existingOwner.uuid !== playerUuid) {
    throw alreadyLinkedElsewhereError(identity.provider)
  }

  if (isSingleAccountProvider(identity.provider)) {
    const current = await session.prepare(
      `SELECT provider_account_id FROM oauth_accounts WHERE player_uuid = ? AND provider = ?`
    )
      .bind(playerUuid, identity.provider)
      .first<{ provider_account_id: string }>()

    if (current && current.provider_account_id !== identity.accountId) {
      throw new AccountLinkError(`You already have a ${label} account linked. Unlink it first to link a different one.`)
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const playerStatement = applyIdentityToPlayerStatement(session, identity, playerUuid)

  // The WHERE on the upsert makes a link that another player claimed
  // between the check above and this write a no-op instead of a takeover;
  // changes === 0 below reports it.
  let result: D1Result
  try {
    result = await session.prepare(
      `INSERT INTO oauth_accounts (
        provider, provider_account_id, player_uuid, created_at, updated_at, username, display_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_account_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        username = excluded.username,
        display_name = excluded.display_name
      WHERE oauth_accounts.player_uuid = excluded.player_uuid`
    )
      .bind(identity.provider, identity.accountId, playerUuid, now, now, identity.username ?? null, identity.displayName ?? null)
      .run()
  } catch (error) {
    // idx_oauth_accounts_one_per_provider: a second Discord/Google link
    // raced in.
    if (String(error).includes("UNIQUE")) {
      throw new AccountLinkError(`You already have a ${label} account linked. Unlink it first to link a different one.`)
    }
    throw error
  }

  if (!result.meta?.changes) {
    throw alreadyLinkedElsewhereError(identity.provider)
  }

  if (playerStatement) {
    await playerStatement.run()
  }

  return { alreadyLinked: existingOwner?.uuid === playerUuid }
}
