import test from "node:test"
import assert from "node:assert/strict"
import { jsonResponse, jsonError, mergeResponseHeaders } from "@/lib/server/http"

const ACCESS = "wasans_v2_access=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=900"
const REFRESH = "wasans_v2_refresh=xyz; Path=/v2/auth; HttpOnly; SameSite=Lax; Max-Age=7776000"

function authCookies() {
  const headers = new Headers()
  headers.append("set-cookie", ACCESS)
  headers.append("set-cookie", REFRESH)
  return headers
}

// The regression this whole file exists for. A successful refresh sets the
// access cookie AND the refresh cookie in one response. The old
// forEach + set merge kept only the last, so the browser's access cookie
// expired after 15 minutes and was never replaced — which is what signed
// everyone out.
test("a response carrying two cookies emits both", () => {
  const response = jsonResponse({ ok: true }, 200, { headers: authCookies() })
  const cookies = response.headers.getSetCookie()

  assert.equal(cookies.length, 2, `expected both cookies, got ${JSON.stringify(cookies)}`)
  assert.ok(cookies.some((cookie) => cookie.startsWith("wasans_v2_access=")), "access cookie was dropped")
  assert.ok(cookies.some((cookie) => cookie.startsWith("wasans_v2_refresh=")), "refresh cookie was dropped")
})

test("the cookies survive intact, not merged into one malformed header", () => {
  const response = jsonResponse({ ok: true }, 200, { headers: authCookies() })

  assert.deepEqual(response.headers.getSetCookie(), [ACCESS, REFRESH])
})

// Logging out clears both cookies the same way. Dropping one left a valid
// access token in the browser for up to 15 minutes after the player clicked
// Log out.
test("an error response clears both cookies", () => {
  const response = jsonError("Refresh token invalid", 401, { headers: authCookies() })
  const cookies = response.headers.getSetCookie()

  assert.equal(response.status, 401)
  assert.equal(cookies.length, 2, `expected both clears, got ${JSON.stringify(cookies)}`)
})

test("ordinary headers still overwrite rather than accumulate", () => {
  const target = new Headers({ "content-type": "application/json", "x-request-id": "old" })
  mergeResponseHeaders(target, { "x-request-id": "new", "cache-control": "no-store" })

  assert.equal(target.get("x-request-id"), "new")
  assert.equal(target.get("cache-control"), "no-store")
  assert.equal(target.get("content-type"), "application/json")
})

test("merging cookies onto headers that already carry one keeps all of them", () => {
  const target = new Headers()
  target.append("set-cookie", "first=1; Path=/")
  mergeResponseHeaders(target, authCookies())

  assert.equal(target.getSetCookie().length, 3)
})

test("a response with no extra headers is unchanged", () => {
  const response = jsonResponse({ ok: true })
  assert.equal(response.headers.getSetCookie().length, 0)
  assert.equal(response.headers.get("content-type"), "application/json")
})
