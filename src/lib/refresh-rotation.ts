// Policy constants and pure decision helpers for refresh-token rotation.
// Kept free of D1/`server-only` so they can be unit-tested under
// `node --test` alongside the rest of src/lib.

// How long a refresh token is good for. Every successful rotation issues a
// replacement with a fresh window, so this is an *idle* timeout: an active
// player is never signed out, and someone who disappears entirely still has
// three months before they have to authenticate with Discord again.
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90

// A refresh token is meant to be presented exactly once. But the access +
// refresh cookies are shared by every tab of the same browser — if two tabs'
// access tokens expire around the same moment, both can fire a refresh
// before either tab observes the other's Set-Cookie, so the second request
// presents a token the first one just rotated away, through no fault of its
// own. Within this window after rotation, that's treated as the same benign
// race rather than theft/replay. Sized for a slow mobile connection rather
// than a LAN: the cost of guessing wrong here is signing a real player out.
export const REUSE_GRACE_PERIOD_SECONDS = 120

// The other, more common way a browser legitimately re-presents a rotated
// token: the rotation succeeded server-side but the response never landed
// (connection dropped, tab closed, phone backgrounded mid-request), so the
// cookie still holds the old token while the database has moved on. That can
// repeat, leaving the cookie several links behind the live token, and it is
// bounded only by how flaky the connection is — not by time. Walking a few
// links of the replaced_by chain covers it while still refusing a token from
// deep in a family's history, which is what an actual replay looks like.
export const MAX_REPLACEMENT_CHAIN_HOPS = 8

export type RevokedPresentation = {
  // Unix seconds at which the presented token was revoked.
  revokedAt: number
  now: number
  // Whether the presented token's replaced_by chain still reaches a live
  // token within MAX_REPLACEMENT_CHAIN_HOPS.
  hasActiveDescendant: boolean
}

// Decides whether re-presenting an already-rotated refresh token is a benign
// client-side race (rotate again, keep the player signed in) or a genuine
// replay (revoke the whole family and force re-authentication).
export function isBenignReuse({ revokedAt, now, hasActiveDescendant }: RevokedPresentation) {
  if (hasActiveDescendant) {
    return true
  }

  return now - revokedAt <= REUSE_GRACE_PERIOD_SECONDS
}
