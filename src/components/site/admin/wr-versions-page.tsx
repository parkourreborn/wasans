"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArchiveIcon, ArrowLeftIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDate, formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { archiveFileName, ARCHIVE_PREFIX, normalizeVersionName } from "@/lib/wr-archive"
import { invalidateApi, setApiData, useApi } from "@/hooks/use-api"
import { VERSIONS_URL, type GameVersion } from "@/components/site/game-versions"
import { AdminEmpty, AdminError, AdminLoading, AdminPage, adminRequest, errorText } from "@/components/site/admin/admin-kit"
import { RunVideo } from "@/components/site/run-video"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type WrRun = {
  uuid: string
  trial_name: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  game_version: string | null
  current: boolean
  file_name: string
  archived: boolean
  source: "original" | "published" | null
}
type QueueData = { versions: GameVersion[]; runs: WrRun[] }
type SaveResult = { game_version: string; archive: "archived" | "unchanged" | "missing" | "failed" | null }

const QUEUE_URL = apiV2("/admin/wr-archive")

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
}

// Owners go through every run that was ever a world record and set the game
// version it was played on, oldest first. Saving also names its original in
// the archive (see wr-archive-service.ts).
export function AdminWrVersionsPage() {
  const { data, error, loading, refetch } = useApi<{ data: QueueData }>(QUEUE_URL)
  const queue = data?.data
  const [view, setView] = useState<"missing" | "all">("missing")
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [creating, setCreating] = useState(false)

  const runs = [...(queue?.runs ?? [])].sort((a, b) => a.date - b.date)
  const missing = runs.filter((run) => !run.game_version)
  const visible = view === "missing" ? missing : runs
  const currentIndex = Math.max(0, visible.findIndex((run) => run.uuid === selected))
  const current = visible[currentIndex] ?? null
  const versions = queue?.versions ?? []
  const unarchived = runs.filter((run) => !run.archived).length
  const choice = picked ?? current?.game_version ?? null

  // Going through runs without a version, the last pick carries over (old
  // records come in runs of the same version). In "All", every run shows
  // its own.
  const select = (uuid: string | null) => {
    setSelected(uuid)
    if (view === "all") setPicked(null)
  }

  const move = (step: number) => {
    const target = visible[currentIndex + step]
    if (target) select(target.uuid)
  }

  const save = async () => {
    if (!current || !choice || saving || !queue) return
    const run = current
    const following = view === "missing" ? (visible[currentIndex + 1] ?? visible[currentIndex - 1] ?? null) : (visible[currentIndex + 1] ?? run)
    setSaving(true)
    try {
      const result = await adminRequest<SaveResult>(`/submissions/${encodeURIComponent(run.uuid)}/version`, {
        method: "PATCH",
        body: { version: choice },
        fallback: "Couldn’t save the version",
      })
      const updated = { ...run, game_version: choice, file_name: archiveFileName({ ...run, game_version: choice }) }
      const archived = result?.archive === "archived" || result?.archive === "unchanged"
      setApiData(QUEUE_URL, {
        ...data,
        data: { ...queue, runs: queue.runs.map((entry) => (entry.uuid === run.uuid ? { ...updated, archived: archived || entry.archived } : entry)) },
      })
      select(following?.uuid ?? null)
      invalidateApi(VERSIONS_URL)
      toast.success(
        result?.archive === "missing"
          ? `${run.trial_name} set to ${choice}. No file was found to archive.`
          : result?.archive === "failed"
            ? `${run.trial_name} set to ${choice}. The file gets its new name in the daily sweep.`
            : `${run.trial_name} set to ${choice}`
      )
    } catch (err) {
      toast.error(errorText(err, "Couldn’t save the version"))
    } finally {
      setSaving(false)
    }
  }

  const created = (name: string, list: GameVersion[]) => {
    if (queue) setApiData(QUEUE_URL, { ...data, data: { ...queue, versions: list } })
    setApiData(VERSIONS_URL, { data: { versions: list } })
    setPicked(name)
    setCreating(false)
  }

  const archiveBatch = async () => {
    setArchiving(true)
    try {
      const result = await adminRequest<{ archived: number; missing: number; remaining: number }>("/admin/wr-archive", { fallback: "Archiving failed" })
      toast.success(`Archived ${result?.archived ?? 0}. ${formatCount(result?.remaining ?? 0)} left.`)
      refetch()
    } catch (err) {
      toast.error(errorText(err, "Archiving failed"))
    } finally {
      setArchiving(false)
    }
  }

  // Number keys pick a version (highest is 1), N adds one, Enter saves, J
  // and K move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || !current) return
      const key = event.key.toLowerCase()
      const index = Number(key) - 1
      if (Number.isInteger(index) && index >= 0 && index < Math.min(9, versions.length)) setPicked(versions[index].name)
      else if (key === "enter") void save()
      else if (key === "n") setCreating(true)
      else if (key === "j") move(1)
      else if (key === "k") move(-1)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <AdminPage
      title="WR versions"
      description="Every run that was ever a world record, oldest first. Pick the game version it was played on and save. Its original is then kept for good in the public archive under its name."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/admin/site">
              <ArrowLeftIcon />
              Site
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/archive">
              <ArchiveIcon />
              Archive
            </Link>
          </Button>
        </>
      }
    >
      {error && !queue ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !queue ? <AdminLoading /> : null}
      {queue ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div role="group" aria-label="Show" className="flex gap-0.5 rounded-md border border-line-strong p-0.5">
              {(
                [
                  { value: "missing", label: "Needs a version", count: missing.length },
                  { value: "all", label: "All", count: runs.length },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => {
                    setView(option.value)
                    setSelected(null)
                    setPicked(null)
                  }}
                  className={cn(
                    "label-caps flex h-8 items-center gap-1.5 rounded px-3 text-[14px] transition-colors",
                    view === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                  <span className="num text-[12px] tracking-normal opacity-70">{formatCount(option.count)}</span>
                </button>
              ))}
            </div>
            <span className="flex-1 text-[13px] text-muted-foreground">
              {unarchived === 0
                ? "Every file is archived under its name."
                : `${formatCount(unarchived)} ${unarchived === 1 ? "file isn’t" : "files aren’t"} under ${unarchived === 1 ? "its" : "their"} name yet. The daily sweep does 25 a day.`}
            </span>
            {unarchived > 0 ? (
              <Button type="button" variant="outline" onClick={() => void archiveBatch()} disabled={archiving}>
                {archiving ? <Spinner className="size-4" /> : <ArchiveIcon />}
                Archive 10 now
              </Button>
            ) : null}
          </div>

          {!current ? (
            <AdminEmpty>{view === "missing" ? "Every world record has a version." : "No world records yet."}</AdminEmpty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
              <ol aria-label="World records" className="order-2 m-0 flex max-h-[70vh] list-none flex-col overflow-y-auto border-t border-line p-0 lg:order-1">
                {visible.map((run) => (
                  <li key={run.uuid}>
                    <button
                      type="button"
                      aria-current={run.uuid === current.uuid ? "true" : undefined}
                      onClick={() => select(run.uuid)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                        run.uuid === current.uuid && "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]"
                      )}
                    >
                      <span className="truncate text-[15px] font-medium">{run.trial_name}</span>
                      <span className="num text-[15px] font-semibold">{formatTime(run.time)}</span>
                      <span className="truncate text-[13px] text-muted-foreground">{run.player_name}</span>
                      <span className={cn("text-right text-[12px]", run.game_version ? "text-subtle-foreground" : "text-gold")}>
                        {run.game_version ?? "No version"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

              <section aria-label="World record" className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
                <div className="flex flex-col gap-2">
                  <h2 className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-display text-[40px] font-extrabold uppercase leading-[0.9] md:text-[56px]">{current.trial_name}</span>
                    <span className="num text-[32px] font-semibold leading-none md:text-[44px]">{formatTime(current.time)}</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <Link href={`/players/${encodeURIComponent(current.player_uuid)}`} className="text-[15px] font-medium text-foreground hover:underline hover:underline-offset-4">
                      {current.player_name}
                    </Link>
                    <span>Set {formatDate(current.date)}</span>
                    {current.current ? <span className="label-caps text-[13px] text-gold">Current WR</span> : null}
                    <Link href={`/submissions/${encodeURIComponent(current.uuid)}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                      Run page <ExternalLinkIcon className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>

                <RunVideo key={current.uuid} submissionUuid={current.uuid} label={`${current.trial_name} ${formatTime(current.time)} by ${current.player_name}`} />

                <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
                  <span className="label-caps text-[13px] text-subtle-foreground">Version</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="radiogroup" aria-label="Game version" className="contents">
                      {versions.map((version, index) => (
                        <button
                          key={version.name}
                          type="button"
                          role="radio"
                          aria-checked={choice === version.name}
                          onClick={() => setPicked(version.name)}
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors",
                            choice === version.name ? "border-primary bg-primary/15 text-foreground" : "border-line-strong text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {index < 9 ? <span className="num hidden rounded-sm border border-current/30 px-1 text-[11px] leading-4 md:inline-block">{index + 1}</span> : null}
                          {version.name}
                          {version.is_current ? <span className="text-[11px] text-subtle-foreground">current</span> : null}
                        </button>
                      ))}
                    </div>
                    <NewVersion open={creating} onOpenChange={setCreating} onCreated={created} />
                  </div>
                  {versions.length === 0 && !creating ? (
                    <p className="m-0 text-[13px] text-muted-foreground">No versions yet. Add the one this record was played on.</p>
                  ) : null}
                  <p className="m-0 break-all text-[13px] text-muted-foreground">
                    Saved as{" "}
                    <span className="text-foreground">
                      {ARCHIVE_PREFIX}
                      {current.trial_name}/{archiveFileName({ ...current, game_version: choice })}
                    </span>
                    {current.source === "published" ? ". The original was already gone, so this is the published video." : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" size="lg" onClick={() => void save()} disabled={!choice || saving}>
                    {saving ? <Spinner className="size-4" /> : <CheckIcon />}
                    Save
                  </Button>
                  <span className="hidden text-[13px] text-subtle-foreground lg:inline">
                    Keys: 1–9 pick a version, N adds one, Enter saves, J and K move. Saving can take a few seconds while the file is copied.
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button type="button" variant="outline" size="icon-lg" aria-label="Previous (K)" disabled={currentIndex === 0} onClick={() => move(-1)}>
                      <ChevronUpIcon />
                    </Button>
                    <Button type="button" variant="outline" size="icon-lg" aria-label="Next (J)" disabled={currentIndex >= visible.length - 1} onClick={() => move(1)}>
                      <ChevronDownIcon />
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      ) : null}
    </AdminPage>
  )
}

// Adds a version from the queue, for a record played on one that isn't on
// the list yet. It doesn't become current: new runs keep getting the one
// set in Site.
function NewVersion({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string, versions: GameVersion[]) => void
}) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const normalized = normalizeVersionName(name)
  const invalid = name.trim() !== "" && normalized === null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <PlusIcon className="size-4" aria-hidden />
        New version
      </button>
    )
  }

  const close = () => {
    setName("")
    onOpenChange(false)
  }

  const create = async () => {
    if (!normalized || busy) return
    setBusy(true)
    try {
      const result = await adminRequest<{ versions: GameVersion[] }>("/admin/versions", {
        body: { name: normalized, current: false },
        fallback: "Couldn’t add that version",
      })
      onCreated(normalized, result?.versions ?? [])
      setName("")
      toast.success(`Added ${normalized}. New runs still get the current version.`)
    } catch (err) {
      toast.error(errorText(err, "Couldn’t add that version"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            close()
          }
        }}
        placeholder="Version, like 1.0.2"
        maxLength={32}
        autoFocus
        aria-label="New version"
        aria-invalid={invalid}
        disabled={busy}
        className="h-9 w-40"
      />
      <Button type="submit" variant="outline" disabled={!normalized || busy}>
        {busy ? <Spinner className="size-4" /> : <PlusIcon />}
        Add
      </Button>
      <Button type="button" variant="ghost" onClick={close} disabled={busy}>
        Cancel
      </Button>
      {invalid ? <span className="w-full text-[13px] text-destructive">Letters, numbers, spaces, dots, dashes, underscores or pluses, up to 32.</span> : null}
    </form>
  )
}
