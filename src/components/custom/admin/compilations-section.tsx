"use client"

import * as React from "react"
import { DownloadIcon, ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { useApiGet } from "@/hooks/use-api"
import { SectionCard } from "@/components/custom/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

type CompilationStatus = "queued" | "rendering" | "uploading" | "done" | "failed"

type CompilationRow = {
  id: string
  title: string
  trigger: "scheduled" | "manual"
  requested_by_name: string | null
  status: CompilationStatus
  progress_done: number
  progress_total: number
  trials: number
  skipped: Array<{ trial: string; reason: string }>
  duration_seconds: number | null
  size_bytes: number | null
  download_url: string | null
  youtube_url: string | null
  youtube_error: string | null
  error: string | null
  created_at: number
  finished_at: number | null
}
type CompilationsResponse = { data?: CompilationRow[] }

const POLL_INTERVAL_MS = 5000
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function jsonErrorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) {
      return error.message
    }
  }
  return fallback
}

function isInProgress(status: CompilationStatus) {
  return status === "queued" || status === "rendering" || status === "uploading"
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

// Mirrors compilationTitle() in src/lib/server/compilations.ts for a manual
// render, so the placeholder shows what an empty title field will produce.
function defaultManualTitle() {
  const now = new Date()
  return `World Records — ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

function statusLabel(row: CompilationRow) {
  switch (row.status) {
    case "queued":
      return "Starting"
    case "rendering":
      return `Rendering ${row.progress_done}/${row.progress_total}`
    case "uploading":
      return "Uploading"
    case "done":
      return "Done"
    case "failed":
      return "Failed"
  }
}

export function CompilationsSection() {
  const { data, loading, error, refetch } = useApiGet<CompilationsResponse>(apiV2("/admin/compilations"))
  const [title, setTitle] = React.useState("")
  const [starting, setStarting] = React.useState(false)

  const compilations = data?.data || []
  const anyInProgress = compilations.some((row) => isInProgress(row.status))

  // Only poll while something is rendering; a finished list doesn't change.
  React.useEffect(() => {
    if (!anyInProgress) return
    const timer = window.setInterval(refetch, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [anyInProgress, refetch])

  const generate = async () => {
    setStarting(true)
    try {
      const response = await fetch(apiV2("/admin/compilations"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to start the compilation"))
      }
      setTitle("")
      toast.success("Compilation started. It takes a few minutes to render.")
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to start the compilation")
    } finally {
      setStarting(false)
    }
  }

  return (
    <SectionCard
      title="WR compilations"
      description="Every active trial's world record in one video, in trial order. Renders automatically at 00:00 UTC on the 1st of each month, or generate one now."
    >
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row">
        <Input
          placeholder={defaultManualTitle()}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-label="Intro title (optional)"
        />
        <Button type="button" onClick={generate} disabled={starting || anyInProgress}>
          {starting ? <Spinner className="size-4" /> : null}
          Generate now
        </Button>
      </div>

      {loading && !data ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading compilations...
        </div>
      ) : error && !data ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {compilations.map((row) => {
            const meta = [
              new Date(row.created_at * 1000).toLocaleString(),
              row.trigger === "scheduled" ? "monthly cron" : row.requested_by_name ? `by ${row.requested_by_name}` : "manual",
              `${row.trials - row.skipped.length}/${row.trials} trials`,
              formatDuration(row.duration_seconds),
              formatSize(row.size_bytes),
            ].filter(Boolean)

            return (
              <div key={row.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{row.title}</p>
                      <Badge
                        variant={row.status === "done" ? "approved" : row.status === "failed" ? "destructive" : "secondary"}
                      >
                        {isInProgress(row.status) ? <Spinner className="size-3" /> : null}
                        {statusLabel(row)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {row.youtube_url ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={row.youtube_url} target="_blank" rel="noreferrer">
                          <ExternalLinkIcon className="size-4" /> YouTube
                        </a>
                      </Button>
                    ) : null}
                    {row.download_url ? (
                      <Button asChild size="sm">
                        <a href={row.download_url}>
                          <DownloadIcon className="size-4" /> Download
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {row.status === "rendering" && row.progress_total > 0 ? (
                  <Progress value={(row.progress_done / row.progress_total) * 100} />
                ) : null}

                {row.skipped.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Skipped: {row.skipped.map((s) => `${s.trial} (${s.reason})`).join(", ")}
                  </p>
                ) : null}
                {row.error ? <p className="text-xs text-destructive">{row.error}</p> : null}
                {row.youtube_error ? (
                  <p className="text-xs text-destructive">YouTube upload failed: {row.youtube_error}</p>
                ) : null}
              </div>
            )
          })}
          {compilations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compilations yet.</p>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
