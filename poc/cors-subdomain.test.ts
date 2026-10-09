// PoC (local only): the CORS allowlist trusts every subdomain of tully.sh and
// parkourreborn.com, with credentials. Any page on any of those hosts can
// read authenticated /v2 responses, and because those hosts are same-site,
// the SameSite=Lax auth cookies are sent with their requests too.
//
// Run: node --conditions=react-server --import tsx --test poc/cors-subdomain.test.ts
import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"

const API = "https://wasans.tully.sh/v2/auth/me"

function preflight(origin: string) {
  return middleware(new NextRequest(API, {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": "GET" },
  }))
}

test("an arbitrary sibling subdomain is granted credentialed CORS", () => {
  for (const origin of [
    "https://anything-at-all.tully.sh",
    "https://some.deep.sub.parkourreborn.com",
    "https://assets.wasans.tully.sh", // public R2 bucket host
  ]) {
    const response = preflight(origin)
    assert.equal(response.status, 204, origin)
    assert.equal(response.headers.get("access-control-allow-origin"), origin)
    assert.equal(response.headers.get("access-control-allow-credentials"), "true")
  }
})

test("an unrelated site is refused, so the hole is the subdomain wildcard", () => {
  assert.equal(preflight("https://evil.example").status, 403)
})

test("the CSP is report-only, so it never blocks anything", () => {
  const response = middleware(new NextRequest("https://wasans.tully.sh/"))
  assert.equal(response.headers.get("content-security-policy"), null)
  assert.match(response.headers.get("content-security-policy-report-only") || "", /'unsafe-inline' 'unsafe-eval'/)
})
