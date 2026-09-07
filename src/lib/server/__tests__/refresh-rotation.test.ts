import test from "node:test"
import assert from "node:assert/strict"
import {
  MAX_REPLACEMENT_CHAIN_HOPS,
  REFRESH_TOKEN_TTL_SECONDS,
  REUSE_GRACE_PERIOD_SECONDS,
  isBenignReuse,
} from "@/lib/refresh-rotation"
import {
  PROACTIVE_REFRESH_INTERVAL_MS,
  isTransientRefreshFailure,
  refreshRetryDelayMs,
} from "@/lib/auth-refresh"

const NOW = 1_800_000_000

test("a refresh token idles for far longer than the week a player should ever have to re-login within", () => {
  const days = REFRESH_TOKEN_TTL_SECONDS / (60 * 60 * 24)
  assert.ok(days >= 7, `refresh tokens expire after ${days} days of inactivity`)
  assert.equal(days, 90)
})

test("a tab refreshes well before its 15-minute access token expires, so the idle window keeps sliding", () => {
  assert.ok(PROACTIVE_REFRESH_INTERVAL_MS < 15 * 60 * 1000)
})

test("two tabs racing to refresh within the grace period is a race, not a replay", () => {
  assert.equal(
    isBenignReuse({ revokedAt: NOW - 5, now: NOW, hasActiveDescendant: false }),
    true
  )
})

test("a browser that never received the rotated cookie stays signed in however long ago the rotation was", () => {
  // This is the common one: the response was lost (connection dropped, tab
  // closed, phone slept), so the cookie still holds a token the database
  // rotated away hours ago, while the session behind it is very much alive.
  assert.equal(
    isBenignReuse({
      revokedAt: NOW - REUSE_GRACE_PERIOD_SECONDS - 60 * 60 * 6,
      now: NOW,
      hasActiveDescendant: true,
    }),
    true
  )
})

test("an old token from a family with nothing live left is a replay and revokes the family", () => {
  assert.equal(
    isBenignReuse({
      revokedAt: NOW - REUSE_GRACE_PERIOD_SECONDS - 1,
      now: NOW,
      hasActiveDescendant: false,
    }),
    false
  )
})

test("the replaced_by walk covers several lost responses in a row without unbounded work", () => {
  assert.ok(MAX_REPLACEMENT_CHAIN_HOPS > 1)
  assert.ok(MAX_REPLACEMENT_CHAIN_HOPS <= 16)
})

test("a rate-limited or erroring refresh is retryable, never read as being signed out", () => {
  assert.equal(isTransientRefreshFailure(429), true)
  assert.equal(isTransientRefreshFailure(500), true)
  assert.equal(isTransientRefreshFailure(503), true)
})

test("a 401 from refresh is the session genuinely ending, so it is not retried", () => {
  assert.equal(isTransientRefreshFailure(401), false)
  assert.equal(isTransientRefreshFailure(403), false)
})

test("refresh retries back off and then stop", () => {
  const delays: number[] = []
  for (let attempt = 0; ; attempt++) {
    const delay = refreshRetryDelayMs(attempt)
    if (delay === null) {
      break
    }
    delays.push(delay)
    assert.ok(attempt < 10, "retries must terminate")
  }

  assert.ok(delays.length >= 2)
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i] > delays[i - 1], "each retry waits longer than the last")
  }
})
