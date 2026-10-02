"use client"

import { useCallback, useEffect, useState } from "react"

export type ApiQueryState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

type ErrorEnvelope = { error?: { message?: string } }

// Small shared fetch+loading+error hook — replaces the fetch/useState
// boilerplate that used to be duplicated on every page. Returns the parsed
// response body as-is (callers know the shape of whichever endpoint,
// v1 or v2, they're pointed at).
export function useApiGet<T>(url: string | null): ApiQueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(url))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!url) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as (T & ErrorEnvelope) | null

        if (cancelled) {
          return
        }

        if (!response.ok) {
          throw new Error(json?.error?.message || `Request failed (${response.status})`)
        }

        setData(json)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, tick])

  const refetch = useCallback(() => setTick((value) => value + 1), [])

  return { data, loading, error, refetch }
}
