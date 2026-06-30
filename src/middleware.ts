import { NextRequest, NextResponse } from "next/server"

const allowedDomains = ["tully.sh", "parkourreborn.com"]

function isAllowedOrigin(origin: string) {
  try {
    const { hostname, protocol } = new URL(origin)

    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return false
    }

    return allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )
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

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin")
  const isPreflight = request.method === "OPTIONS"

  if (!origin) {
    if (isPreflight) {
      return new NextResponse(null, { status: 204 })
    }

    return NextResponse.next()
  }

  if (!isAllowedOrigin(origin)) {
    if (isPreflight) {
      return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
    }

    return NextResponse.next()
  }

  if (isPreflight) {
    const response = new NextResponse(null, { status: 204 })
    applyCorsHeaders(response, origin)
    return response
  }

  const response = NextResponse.next()
  applyCorsHeaders(response, origin)
  return response
}

export const config = {
  matcher: ["/v1/:path*"],
}
