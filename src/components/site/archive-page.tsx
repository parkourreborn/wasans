"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { DownloadIcon, ExternalLinkIcon, FileVideoIcon, SearchIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDate, formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { PageHeader } from "@/components/site/page-header"
import { runPosterUrl, RunVideo } from "@/components/site/run-video"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DATE_FILTERS,
  FILTER_KEYS,
  NO_VERSION_FILTER,
  SORTS,
  filterArchive,
  formatBytes,
  type ArchiveEntry,
  type ArchiveFilters as Filters,
} from "@/lib/archive-filters"

function filtersFrom(params: URLSearchParams): Filters {
  return { q: params.get("q") ?? "", trial: params.get("trial") ?? "", version: params.get("version") ?? "", date: params.get("date") ?? "", sort: params.get("sort") ?? "" }
}

// The public WR archive: every world record's original file, laid out like
// a file browser. Everything is loaded at once and filtered here; it's one
// row per record ever set, so it stays small.
export function ArchivePage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, error, loading, refetch } = useApi<{ data?: ArchiveEntry[] }>(apiV2("/archive"))
  const entries = data?.data ?? []
  const [filters, setFilters] = useState<Filters>(() => filtersFrom(new URLSearchParams(searchParams.toString())))
  const [open, setOpen] = useState<string | null>(null)

  // Filters live in the URL, so a filtered view can be shared. The search
  // box writes after a pause rather than on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      for (const key of FILTER_KEYS) if (filters[key].trim()) params.set(key, filters[key].trim())
      const search = params.toString()
      if (search !== window.location.search.replace(/^\?/, "")) {
        window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [filters, pathname])

  const set = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const trials = [...new Set(entries.map((entry) => entry.trial_name))].sort((a, b) => a.localeCompare(b))
  const versions = [...new Set(entries.map((entry) => entry.game_version).filter((version): version is string => version !== null))].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  )
  const hasUnversioned = entries.some((entry) => entry.game_version === null)
  const shown = filterArchive(entries, filters, new Date())
  const totalSize = shown.reduce((sum, entry) => sum + (entry.size ?? 0), 0)
  const filtered = FILTER_KEYS.some((key) => key !== "sort" && filters[key])
  const selected = entries.find((entry) => entry.submission_uuid === open) ?? null

  return (
    <div className="pb-16">
      <PageHeader
        title="WR archive"
        description="The original file of every world record ever set, exactly as it was submitted. Kept for good, free to download."
      />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-[1_1_16rem]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
            <Input
              type="search"
              value={filters.q}
              onChange={(event) => set("q", event.target.value)}
              placeholder="Search players, uuids, times, trials"
              aria-label="Search the archive"
              className="h-10 pl-9"
            />
          </div>
          <FilterSelect label="Trial" value={filters.trial} onChange={(value) => set("trial", value)}>
            <NativeSelectOption value="">All trials</NativeSelectOption>
            {trials.map((trial) => (
              <NativeSelectOption key={trial} value={trial}>
                {trial}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          <FilterSelect label="Version" value={filters.version} onChange={(value) => set("version", value)}>
            <NativeSelectOption value="">All versions</NativeSelectOption>
            {versions.map((version) => (
              <NativeSelectOption key={version} value={version}>
                {version}
              </NativeSelectOption>
            ))}
            {hasUnversioned ? <NativeSelectOption value={NO_VERSION_FILTER}>No version yet</NativeSelectOption> : null}
          </FilterSelect>
          <FilterSelect label="Date" value={filters.date} onChange={(value) => set("date", value)}>
            {DATE_FILTERS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </FilterSelect>
          <FilterSelect label="Sort" value={filters.sort} onChange={(value) => set("sort", value)}>
            {SORTS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </FilterSelect>
        </div>

        {loading && !data ? (
          <ul aria-busy="true" className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index}>
                <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : error && !data ? (
          <div className="flex flex-col items-start gap-3 py-12">
            <p className="text-[15px] text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" onClick={refetch}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>
                <span className="num text-foreground">{formatCount(shown.length)}</span> {shown.length === 1 ? "file" : "files"}
                {totalSize > 0 ? `, ${formatBytes(totalSize)}` : ""}
                {filtered ? ` of ${formatCount(entries.length)}` : ""}
              </span>
              {filtered ? (
                <button
                  type="button"
                  onClick={() => setFilters((current) => ({ q: "", trial: "", version: "", date: "", sort: current.sort }))}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <XIcon className="size-3.5" aria-hidden />
                  Clear filters
                </button>
              ) : null}
            </div>
            {shown.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted-foreground">
                {entries.length === 0 ? "Nothing archived yet." : "No files match these filters."}
              </p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {shown.map((entry) => (
                  <li key={entry.submission_uuid} className="min-w-0">
                    <FileCard entry={entry} onOpen={() => setOpen(entry.submission_uuid)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <FileDialog entry={selected} onClose={() => setOpen(null)} />
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <NativeSelect
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={cn("flex-[1_1_9rem] sm:flex-none [&_select]:h-10", value && "[&_select]:border-primary")}
    >
      {children}
    </NativeSelect>
  )
}

function Thumbnail({ uuid, className }: { uuid: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden bg-surface-3", className)}>
      {failed ? (
        <FileVideoIcon className="size-8 text-subtle-foreground" aria-hidden />
      ) : (
        // A plain img: the poster lives on the assets host and may be missing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={runPosterUrl(uuid)} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      )}
    </div>
  )
}

function FileCard({ entry, onOpen }: { entry: ArchiveEntry; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="relative">
        <Thumbnail uuid={entry.submission_uuid} />
        <span className="label-caps absolute left-2 top-2 rounded-sm bg-background/80 px-1.5 text-[11px] text-foreground backdrop-blur">{entry.trial_name}</span>
        {entry.current ? <span className="label-caps absolute right-2 top-2 rounded-sm bg-background/80 px-1.5 text-[11px] text-gold backdrop-blur">Current WR</span> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
        <span className="flex min-w-0 items-start gap-2">
          <FileVideoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span className="line-clamp-2 break-all text-[14px] font-medium leading-snug" title={entry.file_name}>
            {entry.file_name}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-subtle-foreground">
          <span>{formatDate(entry.date)}</span>
          <span aria-hidden>·</span>
          <span>{formatBytes(entry.size)}</span>
          <span aria-hidden>·</span>
          <span className={entry.game_version ? undefined : "text-muted-foreground"}>{entry.game_version ?? "No version"}</span>
        </span>
      </div>
    </button>
  )
}

function FileDialog({ entry, onClose }: { entry: ArchiveEntry | null; onClose: () => void }) {
  const facts: Array<[string, React.ReactNode]> = entry
    ? [
        ["Trial", entry.trial_name],
        [
          "Player",
          <Link key="player" href={`/players/${encodeURIComponent(entry.player_uuid)}`} className="hover:underline hover:underline-offset-4">
            {entry.player_name}
          </Link>,
        ],
        ["Time", <span key="time" className="num">{formatTime(entry.time)}</span>],
        ["Version", entry.game_version ?? "Not set yet"],
        ["Set on", formatDate(entry.date)],
        ["Size", formatBytes(entry.size)],
        ["File", entry.source === "published" ? "The published video. The original was gone before the archive existed." : "The original, as submitted"],
      ]
    : []

  return (
    <Dialog open={entry !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-5 sm:max-w-3xl">
        {entry ? (
          <>
            <DialogHeader className="gap-1 pr-8">
              <DialogTitle className="break-all text-[17px] font-semibold leading-snug">{entry.file_name}</DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground">
                {entry.current ? "The current world record on " : "A former world record on "}
                {entry.trial_name}
              </DialogDescription>
            </DialogHeader>
            <RunVideo key={entry.submission_uuid} submissionUuid={entry.submission_uuid} label={`${entry.trial_name} ${formatTime(entry.time)} by ${entry.player_name}`} />
            <dl className="m-0 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[7rem_minmax(0,1fr)]">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="label-caps text-[12px] text-subtle-foreground sm:pt-0.5">{label}</dt>
                  <dd className="m-0 min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={apiV2(`/archive/${encodeURIComponent(entry.submission_uuid)}/download`)}>
                  <DownloadIcon />
                  Download
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/submissions/${encodeURIComponent(entry.submission_uuid)}`}>
                  <ExternalLinkIcon />
                  Run page
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
