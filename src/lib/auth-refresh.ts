// Decision helpers for the transparent access-token refresh, kept free of
// window/fetch so they can be unit-tested under `node --test`.

export const V2_API_PREFIX = "/v2/"
export const V2_REFRESH_PATH = "/v2/auth/refresh"
export const V2_LOGOUT_PATH = "/v2/auth/logout"

export function requestPathname(raw: string, origin: string) {
  try {
    return new URL(raw, origin).pathname
  } catch {
    return raw
  }
}

// A 401 from a v2 endpoint means the 15-minute access token has expired,
// which the 30-day refresh token can fix. The two exceptions are the
// endpoints that mint or clear the session themselves: a 401 from those
// means there is no session left to refresh, and retrying them would loop.
export function shouldAttemptAuthRefresh(path: string, status: number) {
  if (status !== 401) {
    return false
  }

  if (!path.startsWith(V2_API_PREFIX)) {
    return false
  }

  return path !== V2_REFRESH_PATH && path !== V2_LOGOUT_PATH
}
