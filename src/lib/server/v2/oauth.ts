import "server-only"
import { getDiscordClientId, getDiscordClientSecret } from "@/lib/server/discord-oauth"
import { getGoogleClientId, getGoogleClientSecret } from "@/lib/server/google-oauth"
import {
  exchangeRobloxCodeForToken,
  getRobloxClientId,
  getRobloxClientSecret,
  getRobloxUser,
  robloxAuthorizeUrl,
} from "@/lib/server/roblox"
import {
  AccountLinkError,
  discordIdentity,
  exchangeCodeForToken,
  exchangeGoogleCodeForToken,
  findOrCreatePlayerForIdentity,
  getDiscordUser,
  getGoogleUser,
  getSafeNextUrl,
  googleIdentity,
  linkIdentityToPlayer,
  oauthProviderLabels,
  redirectWithAuthError,
  robloxIdentity,
  type OAuthIdentity,
  type OAuthProvider,
} from "@/lib/server/services/auth-service"
import { trackPlayerIp } from "@/lib/server/player-ip-schema"
import { secretsMatch } from "@/lib/constant-time"
import { bumpCacheGeneration } from "./cache"
import { buildAccessCookie, buildRefreshCookie, getJwtSecret, issueAccessToken } from "./http"
import { issueRefreshTokenFamily } from "./tokens"

// Each provider has its own redirect URI, registered in that provider's
// developer console. One callback per provider serves both logging in and
// linking an account to the signed-in player; the link cookie set at the
// start of the flow says which.
const redirectUris: Record<OAuthProvider, string> = {
  discord: "https://wasans.tully.sh/v2/auth/discord/callback",
  google: "https://wasans.tully.sh/v2/auth/google/callback",
  roblox: "https://wasans.tully.sh/v2/auth/roblox/callback",
}

const authorizeUrls: Record<OAuthProvider, string> = {
  discord: "https://discord.com/oauth2/authorize",
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  roblox: robloxAuthorizeUrl,
}

const scopes: Record<OAuthProvider, string> = {
  discord: "identify",
  google: "openid profile",
  roblox: "openid profile",
}

const STATE_COOKIE = "wasans_v2_oauth_state"
const NEXT_COOKIE = "wasans_v2_oauth_next"
const PKCE_COOKIE = "wasans_v2_oauth_pkce"
const LINK_COOKIE = "wasans_v2_oauth_link"
const oauthCookieMaxAge = 600

export type OAuthIntent = { mode: "login" } | { mode: "link"; playerUuid: string }

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

function setCookie(name: string, value: string, isSecure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${oauthCookieMaxAge}${cookieSuffix(isSecure)}`
}

function clearCookie(name: string, isSecure: boolean) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSuffix(isSecure)}`
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256Base64Url(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
}

// Binds a link flow to the player who started it and to this one flow's
// state, so the callback can't be talked into linking to anyone else: the
// cookie is HttpOnly and set by us, and without JWT_SECRET it can't be
// forged.
async function signLinkIntent(secret: string, provider: OAuthProvider, state: string, playerUuid: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`oauth-link:${provider}:${state}:${playerUuid}`))
  return base64Url(new Uint8Array(signature))
}

async function readLinkIntent(request: Request, secret: string, provider: OAuthProvider, state: string) {
  const value = getCookie(request, LINK_COOKIE)
  if (!value) {
    return null
  }

  const separator = value.lastIndexOf(".")
  const playerUuid = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  if (separator <= 0 || !signature) {
    return null
  }

  const expected = await signLinkIntent(secret, provider, state, playerUuid)
  return secretsMatch(signature, expected) ? playerUuid : null
}

function getClientCredentials(provider: OAuthProvider, env: CloudflareEnv) {
  switch (provider) {
    case "discord":
      return { clientId: getDiscordClientId(env), clientSecret: getDiscordClientSecret(env) }
    case "google":
      return { clientId: getGoogleClientId(env), clientSecret: getGoogleClientSecret(env) }
    case "roblox":
      return { clientId: getRobloxClientId(env), clientSecret: getRobloxClientSecret(env) }
  }
}

// Builds the provider authorize URL plus the cookies that carry this flow's
// state to the callback. Login wraps it in a redirect; linking returns it
// as JSON from an authenticated API call (see /v2/account/connections), so
// an expired access token is refreshed by the client first like any other
// API call.
export async function buildOAuthStart(request: Request, env: CloudflareEnv, provider: OAuthProvider, intent: OAuthIntent, next: string | null) {
  const isSecure = new URL(request.url).protocol === "https:"
  const state = crypto.randomUUID()
  const authorizeUrl = new URL(authorizeUrls[provider])
  const cookies = [setCookie(STATE_COOKIE, state, isSecure), setCookie(NEXT_COOKIE, getSafeNextUrl(next), isSecure)]

  authorizeUrl.searchParams.set("client_id", getClientCredentials(provider, env).clientId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUris[provider])
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", scopes[provider])
  authorizeUrl.searchParams.set("state", state)

  if (provider === "discord") {
    // Skips Discord's consent screen for players who already authorized.
    authorizeUrl.searchParams.set("prompt", "none")
  }

  if (provider === "google" && intent.mode === "link") {
    // No prompt on Google logins (prompt=none would break first-time ones
    // with interaction_required), but a link should let the player pick
    // which Google account rather than silently reuse the signed-in one.
    authorizeUrl.searchParams.set("prompt", "select_account")
  }

  if (provider === "roblox") {
    // Players link alts, so always offer Roblox's account picker instead of
    // silently using whichever account the browser is signed in to.
    authorizeUrl.searchParams.set("prompt", "select_account")

    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
    authorizeUrl.searchParams.set("code_challenge", await sha256Base64Url(verifier))
    authorizeUrl.searchParams.set("code_challenge_method", "S256")
    cookies.push(setCookie(PKCE_COOKIE, verifier, isSecure))
  } else {
    cookies.push(clearCookie(PKCE_COOKIE, isSecure))
  }

  if (intent.mode === "link") {
    const signature = await signLinkIntent(getJwtSecret(env), provider, state, intent.playerUuid)
    cookies.push(setCookie(LINK_COOKIE, `${intent.playerUuid}.${signature}`, isSecure))
  } else {
    // A link flow abandoned halfway must not turn a later login into a link.
    cookies.push(clearCookie(LINK_COOKIE, isSecure))
  }

  return { authorizeUrl: authorizeUrl.toString(), cookies }
}

export async function startOAuthLoginV2(request: Request, env: CloudflareEnv, provider: OAuthProvider) {
  const next = new URL(request.url).searchParams.get("next")
  const { authorizeUrl, cookies } = await buildOAuthStart(request, env, provider, { mode: "login" }, next)
  const headers = new Headers({ location: authorizeUrl })
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie)
  }

  return new Response(null, { status: 302, headers })
}

async function fetchIdentity(provider: OAuthProvider, code: string, request: Request, env: CloudflareEnv): Promise<OAuthIdentity> {
  const { clientId, clientSecret } = getClientCredentials(provider, env)
  const redirectUri = redirectUris[provider]

  switch (provider) {
    case "discord": {
      const token = await exchangeCodeForToken(code, redirectUri, clientId, clientSecret)
      return discordIdentity(await getDiscordUser(token.access_token, token.token_type))
    }
    case "google": {
      const token = await exchangeGoogleCodeForToken(code, redirectUri, clientId, clientSecret)
      return googleIdentity(await getGoogleUser(token.access_token, token.token_type))
    }
    case "roblox": {
      const verifier = getCookie(request, PKCE_COOKIE)
      if (!verifier) {
        throw new Error("Roblox PKCE verifier is missing")
      }
      const token = await exchangeRobloxCodeForToken(code, verifier, redirectUri, clientId, clientSecret)
      return robloxIdentity(await getRobloxUser(token.access_token, token.token_type))
    }
  }
}

function redirectAfterLink(requestUrl: URL, nextUrl: string, result: { linked: OAuthProvider } | { error: string }, isSecure: boolean) {
  const destination = new URL(nextUrl, requestUrl.origin)
  if ("error" in result) {
    destination.searchParams.set("link_error", result.error)
  } else {
    destination.searchParams.set("linked", result.linked)
  }

  const headers = new Headers({ location: destination.toString() })
  for (const name of [STATE_COOKIE, NEXT_COOKIE, PKCE_COOKIE, LINK_COOKIE]) {
    headers.append("set-cookie", clearCookie(name, isSecure))
  }

  return new Response(null, { status: 302, headers })
}

export async function completeOAuthV2(request: Request, env: CloudflareEnv, provider: OAuthProvider) {
  const label = oauthProviderLabels[provider]
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const state = requestUrl.searchParams.get("state")
  const storedState = getCookie(request, STATE_COOKIE)
  const nextUrl = getSafeNextUrl(getCookie(request, NEXT_COOKIE))
  const isSecure = requestUrl.protocol === "https:"

  if (!state || !storedState || state !== storedState) {
    return redirectWithAuthError(requestUrl, `${label} login state is invalid`)
  }

  const secret = getJwtSecret(env)
  const linkPlayerUuid = await readLinkIntent(request, secret, provider, state)

  if (linkPlayerUuid) {
    // No code means the player backed out on the provider's consent screen
    // (the provider sends ?error= instead).
    if (!code) {
      return redirectAfterLink(requestUrl, nextUrl, { error: `Linking your ${label} account was cancelled.` }, isSecure)
    }

    try {
      const identity = await fetchIdentity(provider, code, request, env)
      await linkIdentityToPlayer(env.wasans, linkPlayerUuid, identity)
      // A new Discord or first Roblox link changes the player's avatar in
      // every cached listing.
      await bumpCacheGeneration(env.CACHE)
      return redirectAfterLink(requestUrl, nextUrl, { linked: provider }, isSecure)
    } catch (error) {
      if (error instanceof AccountLinkError) {
        return redirectAfterLink(requestUrl, nextUrl, { error: error.message }, isSecure)
      }
      console.error(error)
      return redirectAfterLink(requestUrl, nextUrl, { error: `Linking your ${label} account failed. Try again.` }, isSecure)
    }
  }

  if (!code) {
    return redirectWithAuthError(requestUrl, `${label} login was cancelled`)
  }

  try {
    const identity = await fetchIdentity(provider, code, request, env)
    const player = await findOrCreatePlayerForIdentity(env.wasans, identity)

    await trackPlayerIp(env.wasans, player.uuid, request)

    const accessToken = await issueAccessToken(player.uuid, player.permission, secret)
    const issuedRefresh = await issueRefreshTokenFamily(env.wasans, player.uuid)

    const destinationUrl = new URL(nextUrl, requestUrl.origin)
    const headers = new Headers({ location: destinationUrl.toString() })

    headers.append("set-cookie", buildAccessCookie(request, accessToken))
    headers.append("set-cookie", buildRefreshCookie(request, issuedRefresh.refreshToken, issuedRefresh.expiresAt))
    for (const name of [STATE_COOKIE, NEXT_COOKIE, PKCE_COOKIE, LINK_COOKIE]) {
      headers.append("set-cookie", clearCookie(name, isSecure))
    }

    return new Response(null, { status: 302, headers })
  } catch (error) {
    console.error(error)
    return redirectWithAuthError(requestUrl, `${label} login failed`)
  }
}
