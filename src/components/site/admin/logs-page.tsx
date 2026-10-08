"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { LOG_BUCKETS, describeLog, parseLogDetails, type LogBucket, type LogRow } from "@/lib/admin-logs"
import { formatCount, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { AdminEmpty, AdminError, AdminLoading, AdminPage, nowSeconds } from "@/components/site/admin/admin-kit"
import { Pager } from "@/components/site/pager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type LogsResponse = {
  data?: {
    results: LogRow[]
    total: number
    page: number
    limit: number
    summary: { latest_error: { created_at: number } | null }
    bucket_counts: Record<LogBucket, number>
  }
}

const PAGE_SIZE = 50
const RANGES = [
  { key: "24h", label: "Last 24 hours", seconds: 86400 },
  { key: "7d", label: "Last 7 days", seconds: 7 * 86400 },
  { key: "30d", label: "Last 30 days", seconds: 30 * 86400 },
  { key: "all", label: "All time", seconds: 0 },
] as const

// Same key and event the nav badges listen to (site/use-nav-badges.ts).
const LAST_SEEN_ERROR_KEY = "wasans:last-seen-error-at"

const TONE_CLASS = {
  error: "text-destructive",
  good: "text-success",
  bad: "text-[#ff8880]",
  info: "text-[#69c1fc]",
  admin: "text-[#bf9bfc]",
  muted: "text-muted-foreground",
} as const

// Floors "now" to the minute so the URL (and the cache key) stays stable
// across renders within a minute.
function sinceFor(range: string) {
  const match = RANGES.find((entry) => entry.key === range)
  if (!match || match.seconds === 0) return null
  return Math.floor(nowSeconds() / 60) * 60 - match.seconds
}

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const dayAndTime = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

function formatWhen(unix: number, now: number) {
  const date = new Date(unix * 1000)
  return now - unix < 20 * 3600 && new Date(now * 1000).getDate() === date.getDate() ? timeOnly.format(date) : dayAndTime.format(date)
}

export function AdminLogsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const bucket = (LOG_BUCKETS.some((entry) => entry.key === searchParams.get("bucket")) ? searchParams.get("bucket") : "all") as LogBucket
  const range = RANGES.some((entry) => entry.key === searchParams.get("range")) ? (searchParams.get("range") as string) : "7d"
  const q = searchParams.get("q") ?? ""
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const [search, setSearch] = useState(q)
  const [open, setOpen] = useState<number | null>(null)

  const update = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    if (!("page" in patch)) params.delete("page")
    setOpen(null)
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
  }

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (search === q) return
    const timer = window.setTimeout(() => update({ q: search.trim() || null }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const pageHref = (next: number) => {
    const next_ = new URLSearchParams(searchParams.toString())
    if (next === 1) next_.delete("page")
    else next_.set("page", String(next))
    return `${pathname}${next_.size ? `?${next_}` : ""}`
  }

  const since = sinceFor(range)
  const params = new URLSearchParams({ group: "1", limit: String(PAGE_SIZE), page: String(page) })
  if (bucket !== "all") params.set("bucket", bucket)
  if (q) params.set("q", q)
  if (since) params.set("since", String(since))
  const { data, error, loading, refetch } = useApi<LogsResponse>(`${apiV2("/admin/audit-logs")}?${params}`)
  const logs = data?.data
  const rows = logs?.results ?? []
  const now = nowSeconds()
  const latestError = logs?.summary.latest_error?.created_at ?? null

  // Opening the logs counts as seeing the newest error.
  useEffect(() => {
    if (latestError === null) return
    try {
      window.localStorage.setItem(LAST_SEEN_ERROR_KEY, String(latestError))
      window.dispatchEvent(new CustomEvent("wasans:last-seen-error-updated"))
    } catch {
      // Private mode: the dot just stays.
    }
  }, [latestError])

  return (
    <AdminPage title="Logs" description="Errors from the server and from pages crashing in browsers, plus every staff action.">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
          {LOG_BUCKETS.map((entry) => {
            const on = entry.key === bucket
            const count = logs?.bucket_counts?.[entry.key]
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={on}
                onClick={() => update({ bucket: entry.key === "all" ? null : entry.key })}
                className={cn(
                  "label-caps flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]",
                  on ? "border-foreground bg-foreground text-background" : "border-line-strong text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.label}
                {count !== undefined ? (
                  <span className={cn("num text-[12px] font-medium tracking-normal", on ? "text-background/70" : "text-subtle-foreground", entry.key === "errors" && count > 0 && !on && "text-destructive")}>
                    {formatCount(count)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search the logs</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Player, trial, message" className="h-9 pl-9" />
        </label>
        <Select value={range} onValueChange={(value) => update({ range: value === "7d" ? null : value })}>
          <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && !logs ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !logs ? <AdminLoading /> : null}
      {logs && rows.length === 0 ? (
        <AdminEmpty>{q ? `Nothing matches “${q}” in this range.` : "Nothing logged in this range."}</AdminEmpty>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-4">
          <ol className="m-0 list-none border-t border-line p-0">
            {rows.map((row) => (
              <LogEntry key={row.id} row={row} now={now} open={open === row.id} onToggle={() => setOpen(open === row.id ? null : row.id)} />
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[13px] text-muted-foreground">
              Repeated errors are grouped into one row with a count. Browser console warnings aren’t logged; only real crashes are.
            </p>
            {logs && logs.total > PAGE_SIZE ? (
              <Pager page={page} totalPages={Math.ceil(logs.total / PAGE_SIZE)} hrefFor={pageHref} />
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminPage>
  )
}

function linkFor(row: LogRow): { href: string; label: string } | null {
  if (row.entity_type === "submission" && row.entity_uuid && row.action !== "submission_deleted") {
    return { href: `/submissions/${encodeURIComponent(row.entity_uuid)}`, label: "Open the run" }
  }
  if (row.entity_type === "combo_submission" && row.entity_uuid && row.action !== "combo_submission_deleted") {
    return { href: `/submissions/${encodeURIComponent(row.entity_uuid)}`, label: "Open the combo" }
  }
  if (row.entity_type === "wr" && row.entity_uuid) {
    return { href: `/submissions/${encodeURIComponent(row.entity_uuid)}`, label: "Open the run" }
  }
  if (row.entity_type === "player" && row.entity_uuid) {
    return { href: `/admin/players?player=${encodeURIComponent(row.entity_uuid)}`, label: "Open the player" }
  }
  if (row.action === "site_error") {
    const path = parseLogDetails(row).path
    if (typeof path === "string" && path.startsWith("/") && !path.startsWith("/v2/")) return { href: path, label: "Open the page" }
  }
  return null
}

function detailText(row: LogRow) {
  const details = parseLogDetails(row)
  if (row.action === "site_error") {
    const lines = [
      details.name && details.message ? `${details.name}: ${details.message}` : details.message,
      details.stack && typeof details.stack === "string" ? details.stack.split("\n").slice(details.message ? 1 : 0).join("\n") : null,
      details.componentStack ? `Component stack:${details.componentStack}` : null,
      details.userAgent ? `\nBrowser: ${details.userAgent}` : null,
      details.href ? `URL: ${details.href}` : null,
      details.digest ? `Digest: ${details.digest}` : null,
    ]
    return lines.filter(Boolean).join("\n")
  }
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "")
  if (entries.length === 0) return "No extra details."
  return entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")
}

function LogEntry({ row, now, open, onToggle }: { row: LogRow; now: number; open: boolean; onToggle: () => void }) {
  const { tag, tone, text, meta } = describeLog(row)
  const count = Number(row.group_count ?? 1)
  const link = linkFor(row)
  const detail = open ? detailText(row) : ""

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${formatDateTime(row.created_at)} ${tag}: ${text}\n${detail}`)
      toast.success("Details copied")
    } catch {
      toast.error("Couldn’t copy the details")
    }
  }

  return (
    <li className={cn("border-b border-line", open && "bg-surface")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid min-h-14 w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-2 py-2 text-left sm:grid-cols-[7.5rem_7.5rem_minmax(0,1fr)_auto]"
      >
        <span className="num text-[12px] text-muted-foreground sm:whitespace-nowrap">{formatWhen(row.created_at, now)}</span>
        <span className={cn("label-caps col-start-2 row-start-2 text-[12px] sm:col-start-auto sm:row-start-auto sm:text-[13px]", TONE_CLASS[tone])}>{tag}</span>
        <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5 sm:col-start-auto sm:row-start-auto">
          <span className="truncate text-[14px]">{text}</span>
          {meta ? <span className="truncate text-[12px] text-muted-foreground">{meta}</span> : null}
        </span>
        <span className="col-start-3 row-span-2 row-start-1 flex items-center gap-2 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
          {count > 1 ? (
            <span className="num rounded-[3px] border border-destructive/45 px-1.5 text-[12px] text-destructive" aria-label={`${count} times`}>
              ×{formatCount(count)}
            </span>
          ) : null}
          <ChevronDownIcon className={cn("size-4 text-subtle-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div className="mx-2 mb-3 flex flex-col gap-2 rounded-md border border-line bg-background p-3 sm:ml-[8.25rem]">
          <span className="text-[12px] text-muted-foreground">
            {count > 1 && row.first_at
              ? `${formatCount(count)} times between ${formatDateTime(row.first_at)} and ${formatDateTime(row.created_at)}`
              : formatDateTime(row.created_at)}
            {row.actor_name ? ` · by ${row.actor_name}` : ""}
          </span>
          <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">{detail}</pre>
          <span className="flex flex-wrap gap-2">
            {link ? (
              <Button asChild size="sm" variant="outline">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              Copy details
            </Button>
          </span>
        </div>
      ) : null}
    </li>
  )
}
