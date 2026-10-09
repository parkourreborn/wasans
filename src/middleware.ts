import { NextRequest, NextResponse } from "next/server"

// The exact origins allowed to make credentialed cross-origin requests to
// the v2 API. Matched as whole hostnames, never as a domain suffix: a suffix
// test like `.tully.sh` trusts every sibling subdomain, including
// assets.wasans.tully.sh — the public R2 bucket, which can serve
// attacker-uploaded HTML — and since those hosts are same-site, the
// SameSite=Lax auth cookie is sent with their requests too, so the one thing
// that would otherwise blunt a reflected-credentials policy doesn't apply.
// The site itself calls /v2 same-origin (see src/lib/api.ts), so this list
// only needs the genuine cross-origin callers; add a host here deliberately.
const allowedHosts = new Set([
  "wasans.tully.sh",
  "parkourreborn.com",
  "www.parkourreborn.com",
])

function isAllowedOrigin(origin: string) {
  try {
    const { hostname, protocol } = new URL(origin)

    // localhost (any port, http included) is for local development only.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true
    }

    return protocol === "https:" && allowedHosts.has(hostname)
  } catch {
    return false
  }
}

function applyCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin)
  response.headers.set("Access-Control-Allow-Credentials", "true")
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Idempotency-Key, X-Requested-With, Accept"
  )
  response.headers.set("Vary", "Origin")
}

// Everything the pages legitimately pull in. Kept as one place to look so a
// new third-party dependency has to be a deliberate edit rather than an
// accident nobody notices.
const cspDirectives = [
  "default-src 'self'",
  // No third-party scripts at all now that the ad script is gone. The
  // inline/eval allowances are Next's hydration payload only, and are the
  // thing to tighten next by moving them onto nonces.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://*.rbxcdn.com https://assets.wasans.tully.sh",
  "media-src 'self' blob: https://assets.wasans.tully.sh",
  "font-src 'self' data:",
  // R2 S3 endpoint: browsers PUT videos straight to the private uploads
  // bucket with presigned URLs (see /v2/uploads).
  "connect-src 'self' https://assets.wasans.tully.sh https://*.r2.cloudflarestorage.com",
  // Combo videos are YouTube embeds (the no-cookie host); nothing else is
  // framed. Nothing here may be framed, and nothing may post a form off-site.
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://discord.com https://accounts.google.com https://apis.roblox.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

// Applied to every response, API and page alike. These are the headers that
// decide how much an XSS or a clickjacking attempt is worth if one ever
// lands, so they belong on responses that predate the bug rather than being
// added after one is found.
function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin")

  // Report-only to begin with: a CSP that breaks the site is a CSP someone
  // switches off. Watch for violations, tighten script-src onto nonces, then
  // promote this to Content-Security-Policy.
  response.headers.set("Content-Security-Policy-Report-Only", cspDirectives)

  if (request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }

  return response
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin")
  const isApiRequest = request.nextUrl.pathname.startsWith("/v2/")
  const isPreflight = request.method === "OPTIONS"

  if (isPreflight && isApiRequest) {
    if (!origin) {
      return new NextResponse(null, { status: 204 })
    }

    if (!isAllowedOrigin(origin)) {
      return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
    }

    const response = new NextResponse(null, { status: 204 })
    applyCorsHeaders(response, origin)
    return applySecurityHeaders(response, request)
  }

  const response = NextResponse.next()

  if (isApiRequest && origin && isAllowedOrigin(origin)) {
    applyCorsHeaders(response, origin)
  }

  return applySecurityHeaders(response, request)
}

export const config = {
  matcher: [
    // Everything except Next's own build output and files served straight
    // from /public, which do not need (and should not pay for) this pass.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
