"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CopyIcon, DownloadIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { invalidateApi, useApi } from "@/hooks/use-api"
import { ConfirmDialog } from "@/components/site/moderation-dialogs"
import {
  AdminCard,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  adminRequest,
  errorText,
  formatAgo,
  nowSeconds,
} from "@/components/site/admin/admin-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

export function AdminContentPage() {
  return (
    <AdminPage title="Content" description="The banner across the top of the site, and the monthly world record compilation.">
      <Announcements />
      <Compilations />
    </AdminPage>
  )
}

type Announcement = {
  uuid: string
  body: string
  link_url: string | null
  expires_at: number | null
  created_at: number
  created_by_name: string | null
}

const ANNOUNCEMENTS_URL = apiV2("/admin/announcements")

// datetime-local values are local wall-clock time without seconds
// ("2026-09-08T14:30"); Date parses them as local time, which is what the
// owner picked.
function localToUnix(value: string) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function Announcements() {
  const { data, error, loading, refetch } = useApi<{ data: Announcement[] }>(ANNOUNCEMENTS_URL)
  const [body, setBody] = useState("")
  const [link, setLink] = useState("")
  const [expires, setExpires] = useState("")
  const [posting, setPosting] = useState(false)
  const [removing, setRemoving] = useState<Announcement | null>(null)
  const [busy, setBusy] = useState(false)
  const now = nowSeconds()
  const all = data?.data ?? []
  const live = all.filter((item) => !item.expires_at || item.expires_at > now)
  const expired = all.filter((item) => item.expires_at && item.expires_at <= now)

  const post = async () => {
    if (!body.trim()) return
    setPosting(true)
    try {
      await adminRequest("/announcements", {
        body: { body: body.trim(), link_url: link.trim() || null, expires_at: localToUnix(expires) },
        fallback: "Couldn’t post that announcement",
      })
      toast.success("Announcement posted. Everyone sees it on their next page load.")
      setBody("")
      setLink("")
      setExpires("")
      invalidateApi(ANNOUNCEMENTS_URL)
    } catch (err) {
      toast.error(errorText(err, "Couldn’t post that announcement"))
    } finally {
      setPosting(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await adminRequest(`/announcements/${encodeURIComponent(removing.uuid)}`, { method: "DELETE", fallback: "Couldn’t remove it" })
      toast.success("Announcement removed")
      setRemoving(null)
      invalidateApi(ANNOUNCEMENTS_URL)
    } catch (err) {
      toast.error(errorText(err, "Couldn’t remove it"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminSection
      title="Announcements"
      description="A banner across the top of every page. Each signed-in player can dismiss it, and that sticks across their devices."
    >
      <form
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void post()
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
          Message
          <Textarea rows={2} value={body} onChange={(event) => setBody(event.target.value)} placeholder="e.g. Monoxide is now a trial. Runs count from 15 Oct." />
        </label>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            Link (optional)
            <Input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://" className="h-10" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            Take down at (optional)
            <Input type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} className="h-10" />
          </label>
        </div>
        {body.trim() ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground">Preview</span>
            <div className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-surface-2 px-4 py-2 text-sm">
              <span className="label-caps shrink-0 text-[13px] text-primary">Notice</span>
              <span className={cn("min-w-0 truncate", link.trim() && "underline underline-offset-2")}>{body.trim()}</span>
            </div>
          </div>
        ) : null}
        <div>
          <Button type="submit" disabled={posting || !body.trim()}>
            {posting ? <Spinner className="size-4" /> : null}
            Post announcement
          </Button>
        </div>
      </form>

      {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !data ? <AdminLoading /> : null}
      {data && live.length === 0 ? <AdminEmpty>No announcement is showing.</AdminEmpty> : null}
      {live.length > 0 ? (
        <AdminCard>
          <ul className="m-0 list-none p-0">
            {live.map((item) => (
              <AnnouncementRow key={item.uuid} item={item} now={now} onRemove={() => setRemoving(item)} />
            ))}
          </ul>
        </AdminCard>
      ) : null}
      {expired.length > 0 ? (
        <details className="rounded-lg border border-line bg-surface">
          <summary className="label-caps cursor-pointer px-4 py-3 text-[13px] text-muted-foreground">
            Expired <span className="num text-subtle-foreground">{expired.length}</span>
          </summary>
          <ul className="m-0 list-none border-t border-line p-0">
            {expired.map((item) => (
              <AnnouncementRow key={item.uuid} item={item} now={now} onRemove={() => setRemoving(item)} />
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title="Remove this announcement?"
        description={removing ? `“${removing.body}” disappears for everyone.` : ""}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
      />
    </AdminSection>
  )
}

function AnnouncementRow({ item, now, onRemove }: { item: Announcement; now: number; onRemove: () => void }) {
  const expired = item.expires_at !== null && item.expires_at <= now
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("m-0 text-[15px]", expired && "text-muted-foreground")}>{item.body}</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          {item.link_url ? (
            <a href={item.link_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:no-underline">
              {item.link_url}
            </a>
          ) : null}
          {item.link_url ? " · " : ""}
          Posted {formatAgo(item.created_at, now)}
          {item.created_by_name ? ` by ${item.created_by_name}` : ""}
          {item.expires_at ? (expired ? ` · ended ${formatDateTime(item.expires_at)}` : ` · comes down ${formatDateTime(item.expires_at)}`) : ""}
        </p>
      </div>
      <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Remove announcement">
        <XIcon className="size-4" />
      </Button>
    </li>
  )
}

type CompilationStatus = "queued" | "rendering" | "uploading" | "done" | "failed"

type Compilation = {
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
  youtube_title: string
  youtube_description: string | null
  error: string | null
  created_at: number
  finished_at: number | null
}

const COMPILATIONS_URL = apiV2("/admin/compilations")
const POLL_MS = 5000
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const inProgress = (status: CompilationStatus) => status === "queued" || status === "rendering" || status === "uploading"

// Mirrors compilationTitle() in src/lib/server/compilations.ts for a manual
// render, so the placeholder shows what an empty title produces.
function defaultTitle() {
  const now = new Date()
  return `World Records — ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

function formatLength(seconds: number | null) {
  if (!seconds) return null
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Couldn’t copy the ${what.toLowerCase()}`)
  }
}

function statusText(row: Compilation) {
  switch (row.status) {
    case "queued":
      return "Starting"
    case "rendering":
      return `Rendering ${row.progress_done} of ${row.progress_total}`
    case "uploading":
      return "Uploading"
    case "done":
      return "Done"
    case "failed":
      return "Failed"
  }
}

function Compilations() {
  const { data, error, loading, refetch } = useApi<{ data: Compilation[] }>(COMPILATIONS_URL)
  const [title, setTitle] = useState("")
  const [starting, setStarting] = useState(false)
  const rows = data?.data ?? []
  const rendering = rows.some((row) => inProgress(row.status))
  const now = nowSeconds()

  // Only poll while something is rendering; a finished list doesn't change.
  useEffect(() => {
    if (!rendering) return
    const timer = window.setInterval(refetch, POLL_MS)
    return () => window.clearInterval(timer)
  }, [rendering, refetch])

  const start = async () => {
    setStarting(true)
    try {
      await adminRequest("/admin/compilations", { body: { title: title.trim() || null }, fallback: "Couldn’t start the compilation" })
      toast.success("Compilation started. It takes a few minutes to render.")
      setTitle("")
      refetch()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t start the compilation"))
    } finally {
      setStarting(false)
    }
  }

  return (
    <AdminSection
      title="WR compilation"
      description="Every active trial’s world record in one video, in trial order. It renders by itself at 00:00 UTC on the 1st of each month. To post it, download it and upload it in YouTube Studio with the copied title and description."
    >
      <form
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          void start()
        }}
      >
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
          Intro title (optional)
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={defaultTitle()} maxLength={100} className="h-10" />
        </label>
        <Button type="submit" className="h-10" disabled={starting || rendering} title={rendering ? "One is already rendering" : undefined}>
          {starting ? <Spinner className="size-4" /> : null}
          Render one now
        </Button>
      </form>

      {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !data ? <AdminLoading /> : null}
      {data && rows.length === 0 ? <AdminEmpty>No compilations yet.</AdminEmpty> : null}
      {rows.length > 0 ? (
        <AdminCard>
          <ul className="m-0 list-none p-0">
            {rows.map((row) => {
              const meta = [
                formatAgo(row.created_at, now),
                row.trigger === "scheduled" ? "monthly" : row.requested_by_name ? `by ${row.requested_by_name}` : "manual",
                `${row.trials - row.skipped.length} of ${row.trials} trials`,
                formatLength(row.duration_seconds),
                formatSize(row.size_bytes),
              ].filter(Boolean)
              return (
                <li key={row.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px]">{row.title}</span>
                        <span
                          className={cn(
                            "label-caps inline-flex items-center gap-1.5 text-[12px]",
                            row.status === "done" ? "text-success" : row.status === "failed" ? "text-destructive" : "text-[#69c1fc]"
                          )}
                        >
                          {inProgress(row.status) ? <Spinner className="size-3" /> : null}
                          {statusText(row)}
                        </span>
                      </span>
                      <span className="text-[13px] text-muted-foreground">{meta.join(" · ")}</span>
                    </div>
                    {row.download_url ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void copyText(row.youtube_title, "Title")}>
                          <CopyIcon /> Title
                        </Button>
                        {row.youtube_description ? (
                          <Button size="sm" variant="outline" onClick={() => void copyText(row.youtube_description as string, "Description")}>
                            <CopyIcon /> Description
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline">
                          <a href="https://www.youtube.com/upload" target="_blank" rel="noreferrer">
                            <ExternalLinkIcon /> YouTube Studio
                          </a>
                        </Button>
                        <Button asChild size="sm">
                          <a href={row.download_url}>
                            <DownloadIcon /> Download
                          </a>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {row.status === "rendering" && row.progress_total > 0 ? (
                    <span className="h-1.5 bg-surface-3" aria-hidden>
                      <span className="block h-full bg-primary" style={{ width: `${(row.progress_done / row.progress_total) * 100}%` }} />
                    </span>
                  ) : null}
                  {row.skipped.length > 0 ? (
                    <p className="m-0 text-[13px] text-muted-foreground">Skipped: {row.skipped.map((s) => `${s.trial} (${s.reason})`).join(", ")}</p>
                  ) : null}
                  {row.error ? <p className="m-0 text-[13px] text-destructive">{row.error}</p> : null}
                </li>
              )
            })}
          </ul>
        </AdminCard>
      ) : null}
    </AdminSection>
  )
}
