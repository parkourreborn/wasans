// Decision helpers for the transparent access-token refresh, kept free of
// window/fetch so they can be unit-tested under `node --test`.

export const V2_API_PREFIX = "/v2/"
export const V2_REFRESH_PATH = "/v2/auth/refresh"
export const V2_LOGOUT_PATH = "/v2/auth/logout"

// The access token lives 15 minutes; rotating every 10 keeps a tab that is
// sitting open ahead of that expiry, and keeps sliding the refresh token's
// 90-day idle window forward for anyone who visits even occasionally.
export const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000

// How many times a refresh is retried after a transient failure, and how
// long to wait between attempts. Short enough that a player waiting on the
// retried request doesn't notice, long enough to outlast a rate-limit
// window rolling over or a worker cold start.
const REFRESH_RETRY_DELAYS_MS = [500, 1500, 4000]

export function requestPathname(raw: string, origin: string) {
  try {
    return new URL(raw, origin).pathname
  } catch {
    return raw
  }
}

// A 401 from a v2 endpoint means the 15-minute access token has expired,
// which the refresh token can fix. The two exceptions are the endpoints that
// mint or clear the session themselves: a 401 from those means there is no
// session left to refresh, and retrying them would loop.
export function shouldAttemptAuthRefresh(path: string, status: number) {
  if (status !== 401) {
    return false
  }

  if (!path.startsWith(V2_API_PREFIX)) {
    return false
  }

  return path !== V2_REFRESH_PATH && path !== V2_LOGOUT_PATH
}

// A 401 from the refresh endpoint is the server saying the session is really
// over. Everything else it can answer with — a rate limit (shared per-IP
// buckets mean one player's burst can spend another's, on carrier NAT) or a
// server-side error — is a temporary condition that must not be mistaken for
// being signed out.
export function isTransientRefreshFailure(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

// Returns the delay before the next attempt, or null once the retries are
// exhausted.
export function refreshRetryDelayMs(attempt: number): number | null {
  return attempt < REFRESH_RETRY_DELAYS_MS.length ? REFRESH_RETRY_DELAYS_MS[attempt] : null
}
