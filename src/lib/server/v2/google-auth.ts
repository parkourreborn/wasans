import "server-only"
import { getGoogleClientId, getGoogleClientSecret } from "@/lib/server/google-oauth"
import {
  exchangeGoogleCodeForToken,
  findOrCreateGooglePlayer,
  getGoogleUser,
  getSafeNextUrl,
  redirectWithAuthError,
} from "@/lib/server/services/auth-service"
import { trackPlayerIp } from "@/lib/server/player-ip-schema"
import { buildAccessCookie, buildRefreshCookie, getJwtSecret, issueAccessToken } from "./http"
import { issueRefreshTokenFamily } from "./tokens"

// Same one-time, fully independent callback pattern as v2's Discord login --
// registered separately in the Google Cloud Console.
export const googleRedirectUriV2 = "https://wasans.tully.sh/v2/auth/google/callback"

const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth"
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

export function startGoogleOAuthV2(request: Request, env: CloudflareEnv) {
  const requestUrl = new URL(request.url)
  const state = crypto.randomUUID()
  const nextUrl = getSafeNextUrl(requestUrl.searchParams.get("next"))
  const authorizeUrl = new URL(googleAuthorizeUrl)

  authorizeUrl.searchParams.set("client_id", getGoogleClientId(env))
  authorizeUrl.searchParams.set("redirect_uri", googleRedirectUriV2)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", "openid profile")
  authorizeUrl.searchParams.set("state", state)
  // No prompt=none here (unlike Discord's flow): that param assumes prior
  // consent already exists and would break first-time Google logins with
  // interaction_required.

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

export async function completeGoogleOAuthV2(request: Request, env: CloudflareEnv) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const state = requestUrl.searchParams.get("state")
  const storedState = getCookie(request, "wasans_v2_oauth_state")
  const nextUrl = getSafeNextUrl(getCookie(request, "wasans_v2_oauth_next"))
  const isSecure = requestUrl.protocol === "https:"

  if (!code || !state || !storedState || state !== storedState) {
    return redirectWithAuthError(requestUrl, "Google login state is invalid")
  }

  try {
    const token = await exchangeGoogleCodeForToken(code, googleRedirectUriV2, getGoogleClientId(env), getGoogleClientSecret(env))
    const googleUser = await getGoogleUser(token.access_token, token.token_type)
    const player = await findOrCreateGooglePlayer(env.wasans, googleUser)

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
    return redirectWithAuthError(requestUrl, "Google login failed")
  }
}
