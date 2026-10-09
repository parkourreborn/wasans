// Regression guard for F-01 (fixed on this branch): the credentialed CORS
// allowlist must match whole hostnames, never a domain suffix. Before the
// fix, any *.tully.sh / *.parkourreborn.com origin was reflected back with
// credentials; now only the exact app hosts are, plus localhost for dev.
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

test("the exact app hosts get credentialed CORS", () => {
  for (const origin of [
    "https://wasans.tully.sh",
    "https://parkourreborn.com",
    "https://www.parkourreborn.com",
  ]) {
    const response = preflight(origin)
    assert.equal(response.status, 204, origin)
    assert.equal(response.headers.get("access-control-allow-origin"), origin)
    assert.equal(response.headers.get("access-control-allow-credentials"), "true")
  }
})

test("arbitrary sibling subdomains are now refused (the F-01 hole)", () => {
  for (const origin of [
    "https://anything-at-all.tully.sh",
    "https://some.deep.sub.parkourreborn.com",
    "https://assets.wasans.tully.sh", // public R2 bucket host
    "https://evil.tully.sh",
  ]) {
    assert.equal(preflight(origin).status, 403, origin)
  }
})

test("unrelated sites stay refused", () => {
  assert.equal(preflight("https://evil.example").status, 403)
})

test("localhost is still allowed for local development", () => {
  assert.equal(preflight("http://localhost:3000").status, 204)
})
