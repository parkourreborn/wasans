"use client"

import { useEffect } from "react"
import { apiV2 } from "@/lib/api"
import {
  PROACTIVE_REFRESH_INTERVAL_MS,
  isTransientRefreshFailure,
  refreshRetryDelayMs,
  requestPathname,
  shouldAttemptAuthRefresh,
} from "@/lib/auth-refresh"

const REFRESH_PATH = apiV2("/auth/refresh")

let refreshPromise: Promise<boolean> | null = null
let installed = false
let nativeFetch: typeof window.fetch | null = null
let lastSuccessfulRefreshAt = 0

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A refresh that fails for a transient reason — the browser lost the network
// mid-request, the worker returned a 5xx, or the per-IP rate limit tripped
// (players behind carrier NAT share a bucket) — says nothing about whether
// the session is still valid. Giving up on the first one is what turns a
// two-second blip into "it signed me out again", so retry a couple of times
// before letting the original 401 through.
async function attemptRefresh(doFetch: typeof window.fetch): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    let transient = true

    try {
      const response = await doFetch(REFRESH_PATH, { method: "POST", cache: "no-store" })
      if (response.ok) {
        lastSuccessfulRefreshAt = Date.now()
        return true
      }

      transient = isTransientRefreshFailure(response.status)
    } catch {
      // Network error: nothing was learned about the session either.
    }

    const backoff = transient ? refreshRetryDelayMs(attempt) : null
    if (backoff === null) {
      return false
    }

    await delay(backoff)
  }
}

// Concurrent 401s (e.g. a page firing several requests at once, or the
// several components that each load /v2/auth/me) share one refresh call
// instead of each racing to rotate the refresh token.
export function refreshV2AccessToken(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false)
  }

  if (!refreshPromise) {
    const doFetch = nativeFetch || window.fetch.bind(window)

    refreshPromise = attemptRefresh(doFetch).finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

// Patches window.fetch so any v2 API call that comes back 401 silently
// refreshes the access token and retries, transparently to every call site.
// The access-token cookie is short-lived (15 min) by design and the refresh
// token behind it is good for 90 days of inactivity.
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

// Rotating on a schedule, rather than only in reaction to a 401, is what
// makes the 90-day window an *idle* timeout instead of a hard deadline: a
// tab left open overnight, or a player who opens the site every few days,
// keeps sliding their refresh token forward and never reaches the end of it.
// Only fires while the tab is actually visible, so background tabs don't
// rotate tokens nobody is waiting on.
function refreshIfStale() {
  if (document.visibilityState !== "visible") {
    return
  }

  if (Date.now() - lastSuccessfulRefreshAt < PROACTIVE_REFRESH_INTERVAL_MS) {
    return
  }

  void refreshV2AccessToken()
}

export function V2AuthRefresh() {
  useEffect(() => {
    installFetchInterceptor()

    const interval = window.setInterval(refreshIfStale, PROACTIVE_REFRESH_INTERVAL_MS)

    // A phone that has been asleep, or a page restored from the back/forward
    // cache, resumes with an access token that expired while it was away —
    // catch that on the way back in rather than on the first failed request.
    document.addEventListener("visibilitychange", refreshIfStale)
    window.addEventListener("pageshow", refreshIfStale)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshIfStale)
      window.removeEventListener("pageshow", refreshIfStale)
    }
  }, [])

  return null
}
