"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

// A small shared cache for GET requests to the API.
//
// Every component that asks for the same URL shares one entry, so two
// widgets that both need /v2/records/world make one request, and coming back
// to a page shows what it showed before while it revalidates. The store
// lives outside React and components read it through useSyncExternalStore;
// that keeps fetching out of render and setState out of effect bodies.

type Entry = {
  data?: unknown
  error?: string
  status?: number
  fetchedAt?: number
  pending?: Promise<void>
}

const store = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

// How long a successful response is reused before a new mount refetches it.
// The API caches for 60s itself, so refetching more often gains nothing.
const FRESH_MS = 30_000

function setEntry(url: string, next: Entry) {
  store.set(url, next)
  listeners.get(url)?.forEach((listener) => listener())
}

type ErrorEnvelope = { error?: { message?: string } | string }

function errorMessage(json: unknown, status: number) {
  const error = (json as ErrorEnvelope | null)?.error
  if (typeof error === "string" && error) {
    return error
  }
  if (error && typeof error === "object" && error.message) {
    return error.message
  }
  return `Request failed (${status})`
}

export function fetchApi(url: string, options: { force?: boolean } = {}): Promise<void> {
  const current = store.get(url)

  if (current?.pending) {
    return current.pending
  }

  if (!options.force && current?.fetchedAt && !current.error && Date.now() - current.fetchedAt < FRESH_MS) {
    return Promise.resolve()
  }

  const pending = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        setEntry(url, {
          data: store.get(url)?.data,
          error: errorMessage(json, response.status),
          status: response.status,
          fetchedAt: Date.now(),
        })
        return
      }
      setEntry(url, { data: json, status: response.status, fetchedAt: Date.now() })
    })
    .catch(() => {
      setEntry(url, {
        data: store.get(url)?.data,
        error: "Couldn't reach the server. Check your connection and try again.",
        fetchedAt: Date.now(),
      })
    })

  setEntry(url, { ...current, pending })
  return pending
}

// Puts a response the app already has (e.g. the run a PATCH returned) into
// the cache, so everything showing that URL updates without a refetch.
export function setApiData(url: string, data: unknown) {
  const current = store.get(url)
  setEntry(url, { data, status: 200, fetchedAt: Date.now(), pending: current?.pending })
}

// Marks every cached URL starting with `prefix` stale and refetches the ones
// something is still showing. Call after a write that changes them.
export function invalidateApi(prefix: string) {
  for (const [url, entry] of store) {
    if (!url.startsWith(prefix)) {
      continue
    }
    store.set(url, { ...entry, fetchedAt: 0 })
    if (listeners.get(url)?.size) {
      void fetchApi(url, { force: true })
    }
  }
}

function getServerSnapshot(): Entry | undefined {
  return undefined
}

export type ApiState<T> = {
  data: T | undefined
  error: string | null
  /** Nothing to show yet: no data and no error for this URL. */
  loading: boolean
  /** A request is in flight, possibly refreshing data already shown. */
  validating: boolean
  refetch: () => void
}

// Pass null to skip the request (e.g. until the user is known).
export function useApi<T>(url: string | null): ApiState<T> {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!url) {
        return () => {}
      }
      let set = listeners.get(url)
      if (!set) {
        set = new Set()
        listeners.set(url, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    [url]
  )

  const getSnapshot = useCallback(() => (url ? store.get(url) : undefined), [url])
  const entry = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (url) {
      void fetchApi(url)
    }
  }, [url])

  const refetch = useCallback(() => {
    if (url) {
      void fetchApi(url, { force: true })
    }
  }, [url])

  return {
    data: entry?.data as T | undefined,
    error: entry?.error ?? null,
    loading: Boolean(url) && entry?.data === undefined && !entry?.error,
    validating: Boolean(entry?.pending),
    refetch,
  }
}

export type ApiQueryState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

// The older shape some pages still use.
export function useApiGet<T>(url: string | null): ApiQueryState<T> {
  const { data, error, loading, refetch } = useApi<T>(url)
  return { data: data ?? null, loading, error, refetch }
}
