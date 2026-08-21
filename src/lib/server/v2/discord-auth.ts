import "server-only"
import { getDiscordClientId, getDiscordClientSecret } from "@/lib/server/discord-oauth"
import {
  exchangeCodeForToken,
  findOrCreatePlayer,
  getDiscordUser,
  getSafeNextUrl,
  redirectWithAuthError,
} from "@/lib/server/services/auth-service"
import { trackPlayerIp } from "@/lib/server/player-ip-schema"
import { buildAccessCookie, buildRefreshCookie, getJwtSecret, issueAccessToken } from "./http"
import { issueRefreshTokenFamily } from "./tokens"

// v2 has its own Discord OAuth redirect URI, registered separately in the
// Discord developer portal, so its login flow is fully independent of v1's
// (different callback route, different cookies, different token issuance).
export const discordRedirectUriV2 = "https://wasans.tully.sh/v2/auth/discord/callback"

const discordAuthorizeUrl = "https://discord.com/oauth2/authorize"
const oauthCookieMaxAge = 600

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

function cookieSuffix(isSecure: boolean) {
  return isSecure ? "; Secure" : ""
}

export function startDiscordOAuthV2(request: Request, env: CloudflareEnv) {
  const requestUrl = new URL(request.url)
  const state = crypto.randomUUID()
  const nextUrl = getSafeNextUrl(requestUrl.searchParams.get("next"))
  const authorizeUrl = new URL(discordAuthorizeUrl)

  authorizeUrl.searchParams.set("client_id", getDiscordClientId(env))
  authorizeUrl.searchParams.set("redirect_uri", discordRedirectUriV2)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", "identify")
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("prompt", "none")

  const isSecure = requestUrl.protocol === "https:"
  const headers = new Headers({ location: authorizeUrl.toString() })
  headers.append(
    "set-cookie",
    `wasans_v2_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${oauthCookieMaxAge}${cookieSuffix(isSecure)}`
  )
  headers.append(
    "set-cookie",
    `wasans_v2_oauth_next=${encodeURIComponent(nextUrl)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${oauthCookieMaxAge}${cookieSuffix(isSecure)}`
  )

  return new Response(null, { status: 302, headers })
}

export async function completeDiscordOAuthV2(request: Request, env: CloudflareEnv) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const state = requestUrl.searchParams.get("state")
  const storedState = getCookie(request, "wasans_v2_oauth_state")
  const nextUrl = getSafeNextUrl(getCookie(request, "wasans_v2_oauth_next"))
  const isSecure = requestUrl.protocol === "https:"

  if (!code || !state || !storedState || state !== storedState) {
    return redirectWithAuthError(requestUrl, "Discord login state is invalid")
  }

  try {
    const token = await exchangeCodeForToken(code, discordRedirectUriV2, getDiscordClientId(env), getDiscordClientSecret(env))
    const discordUser = await getDiscordUser(token.access_token, token.token_type)
    const player = await findOrCreatePlayer(env.wasans, discordUser, token)

    await trackPlayerIp(env.wasans, player.uuid, request)

    const secret = getJwtSecret(env)
    const accessToken = await issueAccessToken(player.uuid, player.permission, secret)
    const issuedRefresh = await issueRefreshTokenFamily(env.wasans, player.uuid)

    const destinationUrl = new URL(nextUrl, requestUrl.origin)
    const headers = new Headers({ location: destinationUrl.toString() })

    headers.append("set-cookie", buildAccessCookie(request, accessToken))
    headers.append("set-cookie", buildRefreshCookie(request, issuedRefresh.refreshToken, issuedRefresh.expiresAt))
    headers.append("set-cookie", `wasans_v2_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSuffix(isSecure)}`)
    headers.append("set-cookie", `wasans_v2_oauth_next=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSuffix(isSecure)}`)

    return new Response(null, { status: 302, headers })
  } catch (error) {
    console.error(error)
    return redirectWithAuthError(requestUrl, "Discord login failed")
  }
}
