// Pure crypto helpers for the v2 API's JWT access tokens and opaque refresh
// tokens. Deliberately has no "server-only" import (unlike the rest of
// src/lib/server) so it stays unit-testable under `node --test`; it never
// touches D1 or cookies itself.

export type JwtClaims = {
  sub: string
  perm: number
  jti: string
  iat: number
  exp: number
}

const JWT_HEADER_SEGMENT = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signJwt(
  claims: { sub: string; perm: number },
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtClaims = {
    sub: claims.sub,
    perm: claims.perm,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + expiresInSeconds,
  }

  const payloadSegment = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signingInput = `${JWT_HEADER_SEGMENT}.${payloadSegment}`

  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput))

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    return null
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts
  const signingInput = `${headerSegment}.${payloadSegment}`

  let signatureBytes: Uint8Array<ArrayBuffer>
  try {
    signatureBytes = base64UrlDecode(signatureSegment)
  } catch {
    return null
  }

  const key = await importHmacKey(secret)
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signingInput))
  if (!valid) {
    return null
  }

  let payload: JwtClaims
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment))) as JwtClaims
  } catch {
    return null
  }

  if (typeof payload.sub !== "string" || typeof payload.perm !== "number" || typeof payload.exp !== "number") {
    return null
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }

  return payload
}

// Opaque refresh tokens: random bytes, url-safe. Only the SHA-256 hash of
// this value is ever stored server-side.
export function generateOpaqueToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
