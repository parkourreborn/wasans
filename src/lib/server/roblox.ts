import "server-only"

// Roblox OAuth 2.0 (OIDC, authorization code + PKCE) and the two public,
// unauthenticated Roblox web APIs used to keep names and avatars current.
// https://create.roblox.com/docs/cloud/auth/oauth2-reference

type RobloxOAuthEnv = {
  robloxClientId?: string
  robloxClientSecret?: string
}

type RobloxTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

// Only the profile-scope claims below are read. With the profile scope,
// name and nickname are the display name and preferred_username is the
// username; sub is the stable Roblox user id (names can change).
export type RobloxUserInfo = {
  sub: string
  name?: string | null
  nickname?: string | null
  preferred_username?: string | null
}

export type RobloxUserNames = {
  id: string
  username: string
  display_name: string
}

export const robloxAuthorizeUrl = "https://apis.roblox.com/oauth/v1/authorize"
const robloxTokenUrl = "https://apis.roblox.com/oauth/v1/token"
const robloxUserInfoUrl = "https://apis.roblox.com/oauth/v1/userinfo"
const robloxUsersUrl = "https://users.roblox.com/v1/users"
const robloxHeadshotUrl = "https://thumbnails.roblox.com/v1/users/avatar-headshot"

// Display names can change once a week, so a few minutes of staleness is
// harmless while sparing Roblox a lookup per page view.
const NAMES_CACHE_TTL_SECONDS = 600
const HEADSHOT_CACHE_TTL_SECONDS = 3600
// users.roblox.com accepts up to 100 ids per call.
const USERS_BATCH_LIMIT = 100

export function getRobloxClientId(env: RobloxOAuthEnv) {
  if (!env.robloxClientId) {
    throw new Error("robloxClientId binding is not configured")
  }

  return env.robloxClientId
}

export function getRobloxClientSecret(env: RobloxOAuthEnv) {
  if (!env.robloxClientSecret) {
    throw new Error("robloxClientSecret binding is not configured")
  }

  return env.robloxClientSecret
}

export function isRobloxUserId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value)
}

export async function exchangeRobloxCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  })

  const response = await fetch(robloxTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  })

  if (!response.ok) {
    throw new Error("Roblox token exchange failed")
  }

  return response.json() as Promise<RobloxTokenResponse>
}

export async function getRobloxUser(accessToken: string, tokenType: string) {
  const response = await fetch(robloxUserInfoUrl, {
    headers: {
      authorization: `${tokenType} ${accessToken}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Unable to load Roblox user")
  }

  const user = (await response.json()) as RobloxUserInfo
  if (!isRobloxUserId(user?.sub)) {
    throw new Error("Roblox user id is invalid")
  }

  return user
}

function namesCacheKey(id: string) {
  return `roblox:names:${id}`
}

// Current username + display name for each id, from Roblox's public users
// API, cached per id in KV. Ids Roblox doesn't return (or every id, if
// Roblox is unreachable) are simply missing from the map, so callers fall
// back to the names stored at link time.
export async function fetchRobloxUserNames(cache: KVNamespace, ids: string[]) {
  const result = new Map<string, RobloxUserNames>()
  const uniqueIds = [...new Set(ids.filter(isRobloxUserId))]

  const cached = await Promise.all(
    uniqueIds.map(async (id) => [id, await cache.get<RobloxUserNames>(namesCacheKey(id), "json").catch(() => null)] as const)
  )

  const missing: string[] = []
  for (const [id, names] of cached) {
    if (names) {
      result.set(id, names)
    } else {
      missing.push(id)
    }
  }

  for (let index = 0; index < missing.length; index += USERS_BATCH_LIMIT) {
    const batch = missing.slice(index, index + USERS_BATCH_LIMIT)

    try {
      const response = await fetch(robloxUsersUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userIds: batch.map(Number), excludeBannedUsers: false }),
      })

      if (!response.ok) {
        console.error(`Roblox users lookup failed with ${response.status}`)
        continue
      }

      const json = (await response.json()) as { data?: Array<{ id: number; name: string; displayName: string }> }
      for (const user of json.data || []) {
        const names = { id: String(user.id), username: user.name, display_name: user.displayName }
        result.set(names.id, names)
        await cache.put(namesCacheKey(names.id), JSON.stringify(names), { expirationTtl: NAMES_CACHE_TTL_SECONDS }).catch(() => {})
      }
    } catch (error) {
      console.error("Roblox users lookup failed", error)
    }
  }

  return result
}

// The CDN URL of a Roblox user's current avatar headshot, or null while
// Roblox hasn't rendered one (or has moderated it). The CDN URL changes
// whenever the avatar does, so it is looked up rather than stored.
export async function fetchRobloxHeadshotUrl(cache: KVNamespace, id: string) {
  if (!isRobloxUserId(id)) {
    return null
  }

  const key = `roblox:headshot:${id}`
  const cached = await cache.get(key).catch(() => null)
  if (cached) {
    return cached
  }

  const url = new URL(robloxHeadshotUrl)
  url.searchParams.set("userIds", id)
  url.searchParams.set("size", "150x150")
  url.searchParams.set("format", "Png")
  url.searchParams.set("isCircular", "false")

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } })
    if (!response.ok) {
      return null
    }

    const json = (await response.json()) as { data?: Array<{ state?: string; imageUrl?: string | null }> }
    const imageUrl = json.data?.[0]?.state === "Completed" ? json.data[0].imageUrl : null
    if (!imageUrl || !imageUrl.startsWith("https://")) {
      return null
    }

    await cache.put(key, imageUrl, { expirationTtl: HEADSHOT_CACHE_TTL_SECONDS }).catch(() => {})
    return imageUrl
  } catch (error) {
    console.error("Roblox headshot lookup failed", error)
    return null
  }
}
