import { getCloudflareContext } from "@opennextjs/cloudflare"
import {
  getDiscordClientId,
  getDiscordClientSecret,
  getDiscordRedirectUri,
} from "@/lib/server/discord-oauth"
import { grantDiscordAuthenticatedRole } from "@/lib/server/notifications"

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
}

type PlayerAuthRow = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
}

type LinkedPlayerRow = PlayerAuthRow & {
  player_uuid: string
}

const discordTokenUrl = "https://discord.com/api/oauth2/token"
const discordMeUrl = "https://discord.com/api/users/@me"
const sessionMaxAge = 60 * 60 * 24 * 30

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

function getSafeNextUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/submissions"
  }

  return value
}

function normalizePlayerName(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const playerName = value.trim().replace(/\s+/g, " ")

  if (playerName.length < 2 || playerName.length > 32) {
    return null
  }

  return playerName
}

function redirectWithAuthError(requestUrl: URL, message: string) {
  const nextUrl = new URL("/submissions", requestUrl.origin)
  nextUrl.searchParams.set("auth_error", message)

  return Response.redirect(nextUrl, 302)
}

async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) {
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

async function getDiscordUser(accessToken: string, tokenType: string) {
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

async function findOrCreatePlayer(
  db: D1Database,
  discordUser: DiscordUserResponse,
  token: DiscordTokenResponse
) {
  const linkedPlayer = await db.prepare(
    `SELECT players.uuid, players.player_id, players.player_name, players.score, players.permission
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = 'discord'
       AND oauth_accounts.provider_account_id = ?`
  )
    .bind(discordUser.id)
    .first<PlayerAuthRow>()

  let player = linkedPlayer ?? await db.prepare(
    `SELECT uuid, player_id, player_name, score, permission
     FROM players
     WHERE player_id = ?`
  )
    .bind(discordUser.id)
    .first<PlayerAuthRow>()

  const now = Math.floor(Date.now() / 1000)
  const accessTokenExpiresAt = String(now + token.expires_in)

  if (!player) {
    const playerName = normalizePlayerName(discordUser.global_name || discordUser.username)

    if (!playerName) {
      throw new Error("Discord username is not valid")
    }

    const playerUuid = crypto.randomUUID()

    await db.prepare(
      `INSERT INTO players (uuid, player_id, player_name, date_joined, permission)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(playerUuid, discordUser.id, playerName, String(now), 0)
      .run()

    player = {
      uuid: playerUuid,
      player_id: discordUser.id,
      player_name: playerName,
      score: 0,
      permission: 0,
    }
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
      String(now),
      String(now)
    )
    .run()

  const linkedAccount = await db.prepare(
    `SELECT player_uuid
     FROM oauth_accounts
     WHERE provider = 'discord' AND provider_account_id = ?`
  )
    .bind(discordUser.id)
    .first<LinkedPlayerRow>()

  if (linkedAccount?.player_uuid !== player.uuid) {
    throw new Error("Unable to link Discord account")
  }

  return player
}

async function createSession(db: D1Database, playerUuid: string) {
  const sessionToken = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + sessionMaxAge

  await db.prepare(
    `INSERT INTO auth_sessions (token, player_uuid, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sessionToken, playerUuid, String(expiresAt), String(now))
    .run()

  return sessionToken
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const state = requestUrl.searchParams.get("state")
  const storedState = getCookie(request, "wasans_discord_oauth_state")
  const nextUrl = getSafeNextUrl(getCookie(request, "wasans_discord_oauth_next"))
  const isSecure = requestUrl.protocol === "https:"

  if (!env?.wasans) {
    return redirectWithAuthError(requestUrl, "DB binding not available")
  }

  if (!code || !state || !storedState || state !== storedState) {
    return redirectWithAuthError(requestUrl, "Discord login state is invalid")
  }

  try {
    const token = await exchangeCodeForToken(
      code,
      getDiscordRedirectUri(),
      getDiscordClientId(env),
      getDiscordClientSecret(env)
    )
    const discordUser = await getDiscordUser(token.access_token, token.token_type)
    const player = await findOrCreatePlayer(env.wasans, discordUser, token)
    const sessionToken = await createSession(env.wasans, player.uuid)

    try {
      await grantDiscordAuthenticatedRole(discordUser.id)
    } catch (error) {
      console.error("Failed to assign Discord authenticated role:", error)
    }

    const destinationUrl = new URL(nextUrl, requestUrl.origin)
    const headers = new Headers({
      location: destinationUrl.toString(),
    })

    headers.append(
      "set-cookie",
      `wasans_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAge}${isSecure ? "; Secure" : ""}`
    )
    headers.append(
      "set-cookie",
      `wasans_discord_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? "; Secure" : ""}`
    )
    headers.append(
      "set-cookie",
      `wasans_discord_oauth_next=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? "; Secure" : ""}`
    )

    return new Response(null, {
      status: 302,
      headers,
    })
  } catch (err) {
    console.error(err)
    return redirectWithAuthError(requestUrl, "Discord login failed")
  }
}
