"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { DownloadIcon, ExternalLinkIcon, FileArchiveIcon, FileVideoIcon, SearchIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDate, formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { compareVersionsDesc } from "@/lib/wr-archive"
import { ZIP_MAX_BYTES, ZIP_MAX_FILES } from "@/lib/zip"
import { useApi } from "@/hooks/use-api"
import { PageHeader } from "@/components/site/page-header"
import { RunThumbnail, RunVideo } from "@/components/site/run-video"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  DATE_FILTERS,
  FILTER_KEYS,
  NO_VERSION_FILTER,
  SORTS,
  archiveTitle,
  filterArchive,
  formatBytes,
  type ArchiveEntry,
  type ArchiveFilters as Filters,
} from "@/lib/archive-filters"

function filtersFrom(params: URLSearchParams): Filters {
  return { q: params.get("q") ?? "", trial: params.get("trial") ?? "", version: params.get("version") ?? "", date: params.get("date") ?? "", sort: params.get("sort") ?? "" }
}

type ZipLink = { url: string; files: number; size: number; name: string }

// Starts a download without leaving the page: the zip link answers with an
// attachment.
function startDownload(url: string) {
  const link = document.createElement("a")
  link.href = url
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// The public WR archive: every world record's original file, laid out like
// a file browser. Everything is loaded at once and filtered here; it's one
// row per record ever set, so it stays small. Several files can be picked
// and downloaded as one zip.
export function ArchivePage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, error, loading, refetch } = useApi<{ data?: ArchiveEntry[] }>(apiV2("/archive"))
  const entries = data?.data ?? []
  const [filters, setFilters] = useState<Filters>(() => filtersFrom(new URLSearchParams(searchParams.toString())))
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)

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
  const versions = [...new Set(entries.map((entry) => entry.game_version).filter((version): version is string => version !== null))].sort(compareVersionsDesc)
  const hasUnversioned = entries.some((entry) => entry.game_version === null)
  const shown = filterArchive(entries, filters, new Date())
  const totalSize = shown.reduce((sum, entry) => sum + (entry.size ?? 0), 0)
  const filtered = FILTER_KEYS.some((key) => key !== "sort" && filters[key])
  const selected = entries.find((entry) => entry.submission_uuid === open) ?? null
  // Picks stay through filter changes, so files from different views can
  // go in one zip. Ones that leave the archive drop out.
  const pickedEntries = entries.filter((entry) => picked.has(entry.submission_uuid))
  const pickedSize = pickedEntries.reduce((sum, entry) => sum + (entry.size ?? 0), 0)
  const allShownPicked = shown.length > 0 && shown.every((entry) => picked.has(entry.submission_uuid))
  const tooMany = pickedEntries.length > ZIP_MAX_FILES
  const tooBig = pickedSize > ZIP_MAX_BYTES

  // A shift-click picks everything shown between it and the last pick.
  const toggle = (uuid: string, range: boolean) => {
    const next = new Set(picked)
    const on = !picked.has(uuid)
    const from = range && anchor ? shown.findIndex((entry) => entry.submission_uuid === anchor) : -1
    const to = shown.findIndex((entry) => entry.submission_uuid === uuid)
    if (from >= 0 && to >= 0) {
      for (const entry of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) {
        if (on) next.add(entry.submission_uuid)
        else next.delete(entry.submission_uuid)
      }
    } else if (on) next.add(uuid)
    else next.delete(uuid)
    setPicked(next)
    setAnchor(uuid)
  }

  const pickShown = () => {
    const next = new Set(picked)
    for (const entry of shown) {
      if (allShownPicked) next.delete(entry.submission_uuid)
      else next.add(entry.submission_uuid)
    }
    setPicked(next)
  }

  const clearPicks = () => {
    setPicked(new Set())
    setAnchor(null)
  }

  const downloadZip = async () => {
    if (zipping || pickedEntries.length === 0 || tooMany || tooBig) return
    setZipping(true)
    try {
      const response = await fetch(apiV2("/archive/zip"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uuids: pickedEntries.map((entry) => entry.submission_uuid) }),
      })
      const json = (await response.json().catch(() => null)) as { data?: ZipLink; error?: { message?: string } } | null
      if (!response.ok || !json?.data) throw new Error(json?.error?.message || "Couldn’t start the download")
      startDownload(json.data.url)
      toast.success(`Downloading ${json.data.name}, ${formatBytes(json.data.size)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t start the download")
    } finally {
      setZipping(false)
    }
  }

  // Escape lets go of every pick (an open file closes first, and in the
  // search box it clears the search instead).
  useEffect(() => {
    if (picked.size === 0 || open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.target instanceof HTMLInputElement) return
      setPicked(new Set())
      setAnchor(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [picked.size, open])

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
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
                {shown.length > 0 ? (
                  <button type="button" onClick={pickShown} className="hover:text-foreground">
                    {allShownPicked ? "Unselect these" : `Select ${shown.length === 1 ? "it" : `all ${formatCount(shown.length)}`}`}
                  </button>
                ) : null}
              </span>
            </div>
            {shown.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted-foreground">
                {entries.length === 0 ? "Nothing archived yet." : "No files match these filters."}
              </p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {shown.map((entry) => (
                  <li key={entry.submission_uuid} className="min-w-0">
                    <FileCard
                      entry={entry}
                      picked={picked.has(entry.submission_uuid)}
                      picking={picked.size > 0}
                      onToggle={(range) => toggle(entry.submission_uuid, range)}
                      onOpen={() => setOpen(entry.submission_uuid)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {pickedEntries.length > 0 ? (
          <div
            role="region"
            aria-label="Selected files"
            className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface-2 px-4 py-3 shadow-lg md:bottom-4"
          >
            <span className="text-[14px]">
              <span className="num font-semibold">{formatCount(pickedEntries.length)}</span> selected
              <span className="text-muted-foreground">, {formatBytes(pickedSize)}</span>
            </span>
            {tooMany || tooBig ? (
              <span className="text-[13px] text-gold">
                {tooMany ? `One zip holds up to ${ZIP_MAX_FILES} files.` : `One zip holds up to ${formatBytes(ZIP_MAX_BYTES)}.`} Pick fewer.
              </span>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={clearPicks}>
                Clear
              </Button>
              <Button type="button" onClick={() => void downloadZip()} disabled={zipping || tooMany || tooBig}>
                {zipping ? <Spinner className="size-4" /> : <FileArchiveIcon />}
                Download zip
              </Button>
            </div>
          </div>
        ) : null}
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

// Once anything is picked, clicking a card picks it too, like a file
// browser. The checkbox shows on hover, on touch screens, and while picking.
function FileCard({
  entry,
  picked,
  picking,
  onToggle,
  onOpen,
}: {
  entry: ArchiveEntry
  picked: boolean
  picking: boolean
  onToggle: (range: boolean) => void
  onOpen: () => void
}) {
  const title = archiveTitle(entry)
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-surface transition-colors hover:bg-surface-2",
        picked ? "border-primary bg-surface-2" : "border-line hover:border-line-strong"
      )}
    >
      <button
        type="button"
        onClick={(event) => (picking ? onToggle(event.shiftKey) : onOpen())}
        aria-label={picking ? `${picked ? "Unselect" : "Select"} ${title}` : undefined}
        className="flex w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="relative">
          <RunThumbnail submissionUuid={entry.submission_uuid} />
          <span className="label-caps absolute bottom-2 left-2 rounded-sm bg-background/80 px-1.5 text-[11px] text-foreground backdrop-blur">{entry.trial_name}</span>
          {entry.current ? <span className="label-caps absolute right-2 top-2 rounded-sm bg-background/80 px-1.5 text-[11px] text-gold backdrop-blur">Current WR</span> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
          <span className="flex min-w-0 items-start gap-2">
            <FileVideoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="line-clamp-2 break-words text-[14px] font-medium leading-snug" title={title}>
              {title}
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
      <span
        className={cn(
          "absolute left-2 top-2 flex size-7 items-center justify-center rounded-md bg-background/80 backdrop-blur transition-opacity [@media(hover:none)]:opacity-100",
          picked || picking ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
        )}
      >
        <Checkbox
          checked={picked}
          onClick={(event) => {
            event.preventDefault()
            onToggle(event.shiftKey)
          }}
          aria-label={`Select ${title}`}
          className="size-[18px] border-foreground/60"
        />
      </span>
    </div>
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
        [
          "File",
          entry.imported
            ? "The original, from the old WR Drive. Doesn’t count toward scores."
            : entry.source === "published"
              ? "The published video. The original was gone before the archive existed."
              : "The original, as submitted",
        ],
      ]
    : []

  return (
    <Dialog open={entry !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-5 sm:max-w-3xl">
        {entry ? (
          <>
            <DialogHeader className="gap-1 pr-8">
              <DialogTitle className="break-words text-[17px] font-semibold leading-snug">{archiveTitle(entry)}</DialogTitle>
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
