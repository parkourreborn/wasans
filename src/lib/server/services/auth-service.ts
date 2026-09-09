import "server-only"
import { getSafeNextUrl } from "@/lib/safe-redirect"
import { getAvailablePlayerName } from "@/lib/server/player-name-service"
import { legalVersion } from "@/lib/legal"
import { normalizeLoginPlayerName } from "@/lib/player-name"
import { generateUUID } from "@/lib/utils"

type DiscordTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

type DiscordUserResponse = {
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
type GoogleUserResponse = {
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

export async function findOrCreatePlayer(db: D1Database, discordUser: DiscordUserResponse) {
  const linkedPlayer = await db.prepare(
    `SELECT players.uuid, players.player_id, players.discord_avatar, players.discord_discriminator, players.player_name, players.score, players.permission
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = 'discord'
       AND oauth_accounts.provider_account_id = ?
       AND COALESCE(players.account_status, 'active') != 'deleted'`
  )
    .bind(discordUser.id)
    .first<PlayerAuthRow>()

  let player = linkedPlayer ?? await db.prepare(
    `SELECT uuid, player_id, discord_avatar, discord_discriminator, player_name, score, permission
     FROM players
     WHERE player_id = ?
       AND COALESCE(account_status, 'active') != 'deleted'`
  )
    .bind(discordUser.id)
    .first<PlayerAuthRow>()

  const now = Math.floor(Date.now() / 1000)

  // Discord's access and refresh tokens are deliberately NOT persisted. The
  // only thing this app ever needed them for was the one /users/@me call
  // during login, which has already happened by the time we get here — so
  // keeping them bought nothing and turned any future database disclosure
  // into a handout of live Discord credentials for every player. The
  // oauth_accounts row keeps only the link between the Discord account id
  // and the player.
  const buildOauthAccountStatement = (playerUuid: string) =>
    db.prepare(
      `INSERT INTO oauth_accounts (
        provider, provider_account_id, player_uuid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_account_id) DO UPDATE SET
        player_uuid = excluded.player_uuid,
        updated_at = excluded.updated_at`
    )
      .bind("discord", discordUser.id, playerUuid, now, now)

  if (!player) {
    const basePlayerName = normalizeLoginPlayerName(discordUser.global_name || discordUser.username)
    if (!basePlayerName) {
      throw new Error("Discord username is not valid")
    }
    const playerName = await getAvailablePlayerName(db, basePlayerName)

    const playerUuid = generateUUID()

    // The player row and its oauth link are independent writes (the oauth
    // row uses the client-generated playerUuid, not anything the INSERT
    // returns), so they go in one D1 batch instead of two round trips.
    await db.batch([
      db.prepare(
        `INSERT INTO players (
          uuid, player_id, discord_avatar, discord_discriminator, player_name, date_joined, permission,
          account_status, legal_terms_accepted_at, legal_privacy_accepted_at, legal_version
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(playerUuid, discordUser.id, discordUser.avatar || null, discordUser.discriminator || null, playerName, now, 0, "active", now, now, legalVersion),
      buildOauthAccountStatement(playerUuid),
    ])

    player = {
      uuid: playerUuid,
      player_id: discordUser.id,
      discord_avatar: discordUser.avatar || null,
      discord_discriminator: discordUser.discriminator || null,
      player_name: playerName,
      score: 0,
      permission: 0,
    }
  } else {
    await db.batch([
      db.prepare(
        `UPDATE players
         SET discord_avatar = ?,
             discord_discriminator = ?,
             account_status = 'active',
             deactivated_at = NULL,
             deleted_at = NULL,
             legal_terms_accepted_at = ?,
             legal_privacy_accepted_at = ?,
             legal_version = ?
         WHERE uuid = ?`
      )
        .bind(discordUser.avatar || null, discordUser.discriminator || null, now, now, legalVersion, player.uuid),
      buildOauthAccountStatement(player.uuid),
    ])

    player.discord_avatar = discordUser.avatar || null
    player.discord_discriminator = discordUser.discriminator || null
  }

  return player
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

// Independent of findOrCreatePlayer on purpose: it must NOT fall back to a
// direct `players.player_id = googleUser.sub` lookup the way the Discord
// path does. That fallback exists only for player rows created before
// oauth_accounts existed (real legacy Discord data) -- there is no
// equivalent legacy Google data, and reusing that pattern here would risk
// matching a Google sub against an unrelated player's player_id with no
// oauth_accounts link to back it up. If you're tempted to merge this with
// findOrCreatePlayer, keep this difference.
export async function findOrCreateGooglePlayer(db: D1Database, googleUser: GoogleUserResponse) {
  const linkedPlayer = await db.prepare(
    `SELECT players.uuid, players.player_id, players.discord_avatar, players.discord_discriminator, players.player_name, players.score, players.permission
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = 'google'
       AND oauth_accounts.provider_account_id = ?
       AND COALESCE(players.account_status, 'active') != 'deleted'`
  )
    .bind(googleUser.sub)
    .first<PlayerAuthRow>()

  const now = Math.floor(Date.now() / 1000)

  const buildOauthAccountStatement = (playerUuid: string) =>
    db.prepare(
      `INSERT INTO oauth_accounts (
        provider, provider_account_id, player_uuid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_account_id) DO UPDATE SET
        player_uuid = excluded.player_uuid,
        updated_at = excluded.updated_at`
    )
      .bind("google", googleUser.sub, playerUuid, now, now)

  if (!linkedPlayer) {
    const basePlayerName = normalizeLoginPlayerName(googleUser.name || googleUser.given_name)
    if (!basePlayerName) {
      throw new Error("Google display name is not valid")
    }
    const playerName = await getAvailablePlayerName(db, basePlayerName)

    const playerUuid = generateUUID()

    await db.batch([
      db.prepare(
        `INSERT INTO players (
          uuid, player_id, discord_avatar, discord_discriminator, player_name, date_joined, permission,
          account_status, legal_terms_accepted_at, legal_privacy_accepted_at, legal_version, auth_provider
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(playerUuid, googleUser.sub, null, null, playerName, now, 0, "active", now, now, legalVersion, "google"),
      buildOauthAccountStatement(playerUuid),
    ])

    return {
      uuid: playerUuid,
      player_id: googleUser.sub,
      discord_avatar: null,
      discord_discriminator: null,
      player_name: playerName,
      score: 0,
      permission: 0,
    }
  }

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
      .bind(now, now, legalVersion, linkedPlayer.uuid),
    buildOauthAccountStatement(linkedPlayer.uuid),
  ])

  return linkedPlayer
}
