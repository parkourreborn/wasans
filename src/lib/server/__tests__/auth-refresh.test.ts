import test from "node:test"
import assert from "node:assert/strict"
import { requestPathname, shouldAttemptAuthRefresh } from "../../auth-refresh"

const ORIGIN = "https://wasans.tully.sh"

test("a 401 from a v2 endpoint is refreshed and retried", () => {
  assert.equal(shouldAttemptAuthRefresh("/v2/submissions", 401), true)
  assert.equal(shouldAttemptAuthRefresh("/v2/admin/trials", 401), true)
})

test("a 401 from /v2/auth/me is refreshed — this is the endpoint every page uses to decide whether the user is signed in", () => {
  assert.equal(shouldAttemptAuthRefresh("/v2/auth/me", 401), true)
})

test("the endpoints that mint or clear the session are never retried", () => {
  assert.equal(shouldAttemptAuthRefresh("/v2/auth/refresh", 401), false)
  assert.equal(shouldAttemptAuthRefresh("/v2/auth/logout", 401), false)
})

test("non-401 responses and non-v2 requests are left alone", () => {
  assert.equal(shouldAttemptAuthRefresh("/v2/submissions", 200), false)
  assert.equal(shouldAttemptAuthRefresh("/v2/submissions", 403), false)
  assert.equal(shouldAttemptAuthRefresh("/v2/submissions", 500), false)
  assert.equal(shouldAttemptAuthRefresh("/api/legacy", 401), false)
  assert.equal(shouldAttemptAuthRefresh("https://medal.tv/clips/abc", 401), false)
})

test("request pathnames are resolved from every shape fetch accepts", () => {
  assert.equal(requestPathname("/v2/auth/me", ORIGIN), "/v2/auth/me")
  assert.equal(requestPathname(`${ORIGIN}/v2/auth/me`, ORIGIN), "/v2/auth/me")
  assert.equal(requestPathname("/v2/submissions?state=pending", ORIGIN), "/v2/submissions")
  assert.equal(requestPathname("https://medal.tv/clips/abc", ORIGIN), "/clips/abc")
})
