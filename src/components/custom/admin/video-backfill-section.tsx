"use client"

import * as React from "react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { useApiGet } from "@/hooks/use-api"
import { SectionCard } from "@/components/custom/page-shell"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type BackfillStatus = {
  started: boolean
  remaining: number
  inFlight: number
  failed: number
}
type BackfillResponse = { data?: BackfillStatus }

const POLL_INTERVAL_MS = 10_000

function jsonErrorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) {
      return error.message
    }
  }
  return fallback
}

// Owner control for running videos that predate server-side processing
// through the same pipeline as new uploads (see
// /v2/admin/videos/backfill). It runs a few at a time in the background and
// keeps going on its own once started.
export function VideoBackfillSection() {
  const { data, loading, error, refetch } = useApiGet<BackfillResponse>(apiV2("/admin/videos/backfill"))
  const [starting, setStarting] = React.useState(false)
  const status = data?.data
  const running = Boolean(status && status.inFlight > 0)

  React.useEffect(() => {
    if (!running) return
    const timer = window.setInterval(refetch, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [running, refetch])

  const start = async () => {
    setStarting(true)
    try {
      const response = await fetch(apiV2("/admin/videos/backfill"), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to start the backfill"))
      }
      toast.success("Backfill running in the background")
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to start the backfill")
    } finally {
      setStarting(false)
    }
  }

  return (
    <SectionCard
      title="Video processing backfill"
      description="Runs videos uploaded before server-side processing through it: re-encoded only if they aren't already H.264 ≤1080p ≤60fps, and given a server-made thumbnail. A few at a time; it keeps going on its own once started."
    >
      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading...
        </div>
      ) : error && !status ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : status ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {status.remaining === 0
              ? "Every video has been processed."
              : `${status.remaining} video${status.remaining === 1 ? "" : "s"} left${running ? `, ${status.inFlight} processing now` : ""}.`}
            {status.failed > 0 ? ` ${status.failed} couldn't be processed (their existing video is unchanged).` : ""}
          </p>
          <Button type="button" variant="outline" onClick={start} disabled={starting || status.remaining === 0}>
            {starting ? <Spinner className="size-4" /> : null}
            {status.started ? "Resume" : "Start backfill"}
          </Button>
        </div>
      ) : null}
    </SectionCard>
  )
}
