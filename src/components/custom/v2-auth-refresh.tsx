"use client"

import { useEffect } from "react"
import { apiV2 } from "@/lib/api"
import { requestPathname, shouldAttemptAuthRefresh } from "@/lib/auth-refresh"

const REFRESH_PATH = apiV2("/auth/refresh")

let refreshPromise: Promise<boolean> | null = null
let installed = false
let nativeFetch: typeof window.fetch | null = null

// Concurrent 401s (e.g. a page firing several requests at once, or the
// several components that each load /v2/auth/me) share one refresh call
// instead of each racing to rotate the refresh token.
export function refreshV2AccessToken(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false)
  }

  if (!refreshPromise) {
    const doFetch = nativeFetch || window.fetch.bind(window)

    refreshPromise = doFetch(REFRESH_PATH, { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

// Patches window.fetch so any v2 API call that comes back 401 silently
// refreshes the access token and retries, transparently to every call site.
// The access-token cookie is short-lived (15 min) by design and the refresh
// token behind it is good for 30 days.
function installFetchInterceptor() {
  if (installed || typeof window === "undefined") {
    return
  }

  installed = true
  const originalFetch = window.fetch.bind(window)
  nativeFetch = originalFetch

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)

    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (!shouldAttemptAuthRefresh(requestPathname(raw, window.location.origin), response.status)) {
      return response
    }

    const refreshed = await refreshV2AccessToken()
    if (!refreshed) {
      return response
    }

    return originalFetch(input, init)
  }
}

// Installed at import time, not only from the effect below: effects of a
// page's own components can run before a sibling component's effect, and any
// v2 request that lands before the patch is in place would get a bare 401
// with no refresh and retry behind it. Installing twice is a no-op, and the
// patch is deliberately never uninstalled — it belongs to the root layout
// and outlives every page.
installFetchInterceptor()

export function V2AuthRefresh() {
  useEffect(() => {
    installFetchInterceptor()
  }, [])

  return null
}
