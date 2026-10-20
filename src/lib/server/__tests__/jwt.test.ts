import test from "node:test"
import assert from "node:assert/strict"
import { signJwt, verifyJwt, generateOpaqueToken, hashToken, signValue, verifyValue } from "../v2/jwt"

test("signJwt/verifyJwt round-trips valid claims", async () => {
  const token = await signJwt({ sub: "player-uuid", perm: 1 }, "test-secret", 60)
  const claims = await verifyJwt(token, "test-secret")

  assert.ok(claims)
  assert.equal(claims?.sub, "player-uuid")
  assert.equal(claims?.perm, 1)
  assert.ok(claims?.jti)
})

test("verifyJwt rejects a token signed with a different secret", async () => {
  const token = await signJwt({ sub: "player-uuid", perm: 0 }, "secret-a", 60)
  const claims = await verifyJwt(token, "secret-b")

  assert.equal(claims, null)
})

test("verifyJwt rejects an expired token", async () => {
  const token = await signJwt({ sub: "player-uuid", perm: 0 }, "test-secret", -1)
  const claims = await verifyJwt(token, "test-secret")

  assert.equal(claims, null)
})

test("verifyJwt rejects a tampered payload", async () => {
  const token = await signJwt({ sub: "player-uuid", perm: 0 }, "test-secret", 60)
  const [header, , signature] = token.split(".")
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: "attacker", perm: 5, iat: 0, exp: 9999999999, jti: "x" }))
    .toString("base64url")
  const tampered = `${header}.${tamperedPayload}.${signature}`

  const claims = await verifyJwt(tampered, "test-secret")
  assert.equal(claims, null)
})

test("verifyJwt rejects malformed tokens", async () => {
  assert.equal(await verifyJwt("not-a-jwt", "test-secret"), null)
  assert.equal(await verifyJwt("a.b", "test-secret"), null)
  assert.equal(await verifyJwt("", "test-secret"), null)
})

test("generateOpaqueToken produces distinct url-safe tokens", () => {
  const a = generateOpaqueToken()
  const b = generateOpaqueToken()

  assert.notEqual(a, b)
  assert.match(a, /^[A-Za-z0-9_-]+$/)
})

test("hashToken is deterministic and distinguishes different inputs", async () => {
  const hashA1 = await hashToken("token-a")
  const hashA2 = await hashToken("token-a")
  const hashB = await hashToken("token-b")

  assert.equal(hashA1, hashA2)
  assert.notEqual(hashA1, hashB)
  assert.match(hashA1, /^[0-9a-f]{64}$/)
})

test("signed values only verify for their own purpose, and never as access tokens", async () => {
  const token = await signValue("archive-zip", [["abc123", "mp4"]], "secret", 60)
  assert.deepEqual(await verifyValue("archive-zip", token, "secret"), [["abc123", "mp4"]])
  assert.equal(await verifyValue("something-else", token, "secret"), null)
  assert.equal(await verifyValue("archive-zip", token, "other-secret"), null)
  assert.equal(await verifyValue("archive-zip", `${token}x`, "secret"), null)
  assert.equal(await verifyJwt(token, "secret"), null)

  const access = await signJwt({ sub: "player", perm: 4 }, "secret", 60)
  assert.equal(await verifyValue("archive-zip", access, "secret"), null)

  const expired = await signValue("archive-zip", ["x"], "secret", -1)
  assert.equal(await verifyValue("archive-zip", expired, "secret"), null)
})
