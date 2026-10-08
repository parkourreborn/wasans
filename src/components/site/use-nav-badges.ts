"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { apiV2 } from "@/lib/api"

// The little dots on the nav: a prize or giveaway the viewer hasn't seen,
// an error in the logs a moderator hasn't seen, prize candidates waiting
// for the owner, runs waiting for review, and the viewer's own runs whose
// video failed to process. Polled once a minute, like the old
// sidebar did.

const lastSeenErrorStorageKey = "wasans:last-seen-error-at"
const lastSeenPrizeStorageKey = "wasans:last-seen-prize-at"
const POLL_MS = 60_000

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

// The /prizes and /logs pages write these keys and fire these events when
// they mark things as seen; other tabs hear about it through `storage`.
function subscribeToSeenKeys(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener("wasans:last-seen-error-updated", listener)
  window.addEventListener("wasans:last-seen-prize-updated", listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener("wasans:last-seen-error-updated", listener)
    window.removeEventListener("wasans:last-seen-prize-updated", listener)
  }
}

function useStoredValue(key: string) {
  const getSnapshot = useCallback(() => readStorage(key), [key])
  return useSyncExternalStore(subscribeToSeenKeys, getSnapshot, () => null)
}

function usePolling(callback: () => Promise<void>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return
    }
    void callback()
    const interval = window.setInterval(() => void callback(), POLL_MS)
    return () => window.clearInterval(interval)
  }, [callback, enabled])
}

// The viewer's pending runs whose video failed. They can't be approved, so
// the player needs to delete and resubmit; `first` is enough to link
// straight to the run when there's only one.
export type FailedVideos = {
  count: number
  first: { uuid: string; trial_name: string; time: number } | null
}

const NO_FAILED_VIDEOS: FailedVideos = { count: 0, first: null }

export function useNavBadges(permission: number, uuid: string | null) {
  const [latestPrizeAt, setLatestPrizeAt] = useState<string | null>(null)
  const [latestErrorAt, setLatestErrorAt] = useState<string | null>(null)
  const [pendingCandidates, setPendingCandidates] = useState(0)
  const [pendingReviews, setPendingReviews] = useState(0)
  const [failedVideos, setFailedVideos] = useState<FailedVideos>(NO_FAILED_VIDEOS)
  const lastSeenPrizeAt = useStoredValue(lastSeenPrizeStorageKey)
  const lastSeenErrorAt = useStoredValue(lastSeenErrorStorageKey)

  // Prizes and giveaways are public, so every visitor gets this one.
  const loadPrizes = useCallback(async () => {
    try {
      const [prizes, giveaways] = await Promise.all([
        fetch(`${apiV2("/prizes")}?filter=active`, { cache: "no-store" }),
        fetch(`${apiV2("/giveaways")}?filter=active`, { cache: "no-store" }),
      ])
      if (!prizes.ok || !giveaways.ok) {
        return
      }
      const prizesJson = (await prizes.json()) as { data?: Array<{ created_at: number }> }
      const giveawaysJson = (await giveaways.json()) as { data?: Array<{ created_at: number }> }
      const created = [...(prizesJson.data || []), ...(giveawaysJson.data || [])].map((item) => item.created_at)
      setLatestPrizeAt(created.length > 0 ? String(Math.max(...created)) : null)
    } catch {
      // A missed poll just leaves the dot as it was.
    }
  }, [])

  // Audit logs are for general moderators and up (combo moderators aren't
  // admitted by /admin/audit-logs).
  const loadErrors = useCallback(async () => {
    try {
      const response = await fetch(`${apiV2("/admin/audit-logs")}?limit=1&kind=errors`, { cache: "no-store" })
      if (!response.ok) {
        return
      }
      const json = (await response.json()) as { data?: { summary?: { latest_error?: { created_at: number } | null } } }
      const createdAt = json.data?.summary?.latest_error?.created_at
      setLatestErrorAt(createdAt != null ? String(createdAt) : null)
    } catch {
      // As above.
    }
  }, [])

  const loadCandidates = useCallback(async () => {
    try {
      const response = await fetch(`${apiV2("/prize-candidates")}?count=1`, { cache: "no-store" })
      if (!response.ok) {
        return
      }
      const json = (await response.json()) as { data?: { count?: number } }
      setPendingCandidates(json.data?.count ?? 0)
    } catch {
      // As above.
    }
  }, [])

  // Runs waiting in the review queue: trials for moderators, combos for
  // combo moderators and up.
  const loadReviews = useCallback(async () => {
    const count = async (path: string) => {
      const response = await fetch(`${apiV2(path)}?state=pending&limit=1`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error("count failed")
      }
      const json = (await response.json()) as { meta?: { count?: number } }
      return json.meta?.count ?? 0
    }
    try {
      const [trials, combos] = await Promise.all([
        permission >= 2 ? count("/submissions") : Promise.resolve(0),
        count("/combo-submissions"),
      ])
      setPendingReviews(trials + combos)
    } catch {
      // As above.
    }
  }, [permission])

  const loadFailedVideos = useCallback(async () => {
    if (!uuid) return
    try {
      const params = new URLSearchParams({ player_uuid: uuid, state: "pending", video_status: "failed", limit: "1" })
      const response = await fetch(`${apiV2("/submissions")}?${params}`, { cache: "no-store" })
      if (!response.ok) {
        return
      }
      const json = (await response.json()) as {
        data?: Array<{ uuid: string; trial_name: string; time: number }>
        meta?: { count?: number }
      }
      const first = json.data?.[0]
      setFailedVideos({
        count: json.meta?.count ?? 0,
        first: first ? { uuid: first.uuid, trial_name: first.trial_name, time: Number(first.time) } : null,
      })
    } catch {
      // As above.
    }
  }, [uuid])

  usePolling(loadPrizes, true)
  usePolling(loadErrors, permission >= 2)
  usePolling(loadCandidates, permission >= 4)
  usePolling(loadReviews, permission >= 1)
  usePolling(loadFailedVideos, Boolean(uuid))

  return {
    newPrizes: Boolean(latestPrizeAt && (!lastSeenPrizeAt || latestPrizeAt > lastSeenPrizeAt)),
    newErrors: permission >= 2 && Boolean(latestErrorAt && (!lastSeenErrorAt || latestErrorAt > lastSeenErrorAt)),
    pendingCandidates: permission >= 4 ? pendingCandidates : 0,
    pendingReviews: permission >= 1 ? pendingReviews : 0,
    failedVideos: uuid ? failedVideos : NO_FAILED_VIDEOS,
  }
}
