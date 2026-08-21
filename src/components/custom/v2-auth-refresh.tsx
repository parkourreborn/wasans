"use client"

import { useEffect } from "react"
import { apiV2 } from "@/lib/api"

const REFRESH_PATH = apiV2("/auth/refresh")

let refreshPromise: Promise<boolean> | null = null

// Concurrent 401s (e.g. a page firing several requests at once) share one
// refresh call instead of each racing to rotate the refresh token.
function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(REFRESH_PATH, { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

function pathnameOf(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

  try {
    return new URL(raw, window.location.origin).pathname
  } catch {
    return raw
  }
}

// The v2 access-token cookie is short-lived (15 min) by design; a 30-day
// refresh token already exists but nothing was calling it, so users got
// logged out on every access-token expiry instead of every 30 days. This
// patches window.fetch once so any v2 API call that comes back 401 silently
// refreshes the access token and retries, transparently to every call site.
export function V2AuthRefresh() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init)

      if (response.status !== 401) {
        return response
      }

      const path = pathnameOf(input)
      if (!path.startsWith("/v2/") || path === "/v2/auth/refresh") {
        return response
      }

      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        return response
      }

      return originalFetch(input, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
