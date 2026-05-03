import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const WINDOW_MS = 1000
const GLOBAL_STATE_KEY = "__OPEN_NEXT_API_RATE_LIMIT_LAST_REQUEST__"

function getLastRequestTs(): number {
  const state = globalThis as unknown as Record<string, unknown>
  return typeof state[GLOBAL_STATE_KEY] === "number"
    ? (state[GLOBAL_STATE_KEY] as number)
    : 0
}

function setLastRequestTs(value: number) {
  const state = globalThis as unknown as Record<string, unknown>
  state[GLOBAL_STATE_KEY] = value
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const now = Date.now()
  const lastRequest = getLastRequestTs()
  if (now - lastRequest < WINDOW_MS) {
    const response = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    response.headers.set("Retry-After", "1")
    return response
  }

  setLastRequestTs(now)
  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
