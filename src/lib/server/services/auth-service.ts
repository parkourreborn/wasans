import "server-only"
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

const discordTokenUrl = "https://discord.com/api/oauth2/token"
const discordMeUrl = "https://discord.com/api/users/@me"

export function getSafeNextUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/"
  }

  return value
}

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

export async function findOrCreatePlayer(db: D1Database, discordUser: DiscordUserResponse, token: DiscordTokenResponse) {
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
  const accessTokenExpiresAt = now + token.expires_in

  if (!player) {
    const basePlayerName = normalizeLoginPlayerName(discordUser.global_name || discordUser.username)
    if (!basePlayerName) {
      throw new Error("Discord username is not valid")
    }
    const playerName = await getAvailablePlayerName(db, basePlayerName)

    const playerUuid = generateUUID()
    await db.prepare(
      `INSERT INTO players (
        uuid, player_id, discord_avatar, discord_discriminator, player_name, date_joined, permission,
        account_status, legal_terms_accepted_at, legal_privacy_accepted_at, legal_version
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(playerUuid, discordUser.id, discordUser.avatar || null, discordUser.discriminator || null, playerName, now, 0, "active", now, now, legalVersion)
      .run()

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
    await db.prepare(
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
      .bind(discordUser.avatar || null, discordUser.discriminator || null, now, now, legalVersion, player.uuid)
      .run()

    player.discord_avatar = discordUser.avatar || null
    player.discord_discriminator = discordUser.discriminator || null
  }

  await db.prepare(
    `INSERT INTO oauth_accounts (
      provider, provider_account_id, player_uuid, access_token, refresh_token, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_account_id) DO UPDATE SET
      player_uuid = excluded.player_uuid,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at`
  )
    .bind(
      "discord",
      discordUser.id,
      player.uuid,
      token.access_token,
      token.refresh_token || null,
      accessTokenExpiresAt,
      now,
      now
    )
    .run()

  return player
}
