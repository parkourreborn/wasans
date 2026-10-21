"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloudDownloadIcon,
  ExternalLinkIcon,
  FolderSearchIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { formatBytes } from "@/lib/archive-filters"
import { formatCount, formatDate, formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { parseRunTime, timeMs } from "@/lib/wr-import"
import { setApiData, useApi } from "@/hooks/use-api"
import { VERSIONS_URL, type GameVersion } from "@/components/site/game-versions"
import { AdminCard, AdminEmpty, AdminError, AdminLoading, AdminPage, adminRequest, errorText } from "@/components/site/admin/admin-kit"
import { isTyping, NewVersion, VersionChoices } from "@/components/site/admin/wr-versions-page"
import { PlayerPicker, type PickedPlayer } from "@/components/site/player-picker"
import { VideoPlayer } from "@/components/site/video-player"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"

type ImportMatch = {
  uuid: string
  player_uuid: string
  player_name: string
  player_score: number
  date: number
  game_version: string | null
  imported: boolean
}
// placeholder is 1 for a player with no account, just a name.
type ImportPlayer = PickedPlayer & { placeholder?: number }
type ImportRow = {
  drive_file_id: string
  file_name: string
  folder_path: string
  size: number | null
  drive_created_at: number | null
  drive_modified_at: number | null
  copy_error: string | null
  status: "pending" | "imported" | "merged" | "skipped"
  submission_uuid: string | null
  // The imported run's video, for an imported file.
  video_status: "processing" | "ready" | "failed" | null
  video_error: string | null
  staged: boolean
  copying: boolean
  date: number | null
  parsed: { trial: string | null; trialText: string; time: number | null; player: string | null }
  version: string | null
  players: ImportPlayer[]
  matches: ImportMatch[]
}
type QueueData = { configured: boolean; default_folder: string; trials: string[]; versions: GameVersion[]; imports: ImportRow[]; waiting_copies: number }
type SaveResult = {
  status: "imported" | "merged" | "skipped" | "pending"
  submission_uuid?: string
  backdated?: boolean
  // A placeholder made for a name-only import.
  player?: ImportPlayer | null
}
type View = "review" | "player" | "skipped" | "done"

const QUEUE_URL = apiV2("/admin/wr-imports")

function driveFileUrl(id: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
}

// datetime-local works in the viewer's time zone, without seconds.
function toLocalInput(seconds: number) {
  const date = new Date(seconds * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? Math.floor(time / 1000) : null
}

function rowLabel(row: ImportRow) {
  return [row.parsed.trial ?? (row.parsed.trialText || "Unknown trial"), row.parsed.time !== null ? formatTime(row.parsed.time) : null].filter(Boolean).join(" ")
}

// Owners go through the old WR Drive's files oldest first: check what the
// name says, pick the player and version, and import it, or match it to the
// same run on the site, which keeps that run and backdates it. See
// wr-import-service.ts.
export function AdminWrImportsPage() {
  const { data, error, loading, refetch } = useApi<{ data: QueueData }>(QUEUE_URL)
  const queue = data?.data
  const [view, setView] = useState<View>("review")
  const [selected, setSelected] = useState<string | null>(null)
  // Old records come in runs of the same version, so the last one carries over.
  const [lastVersion, setLastVersion] = useState<string | null>(null)

  const imports = queue?.imports ?? []
  const copying = imports.some((row) => (row.status === "pending" && !row.staged && !row.copy_error) || row.video_status === "processing")
  const lists: Record<View, ImportRow[]> = {
    review: imports.filter((row) => row.status === "pending"),
    player: imports.filter((row) => row.status === "pending" && row.players.length !== 1),
    skipped: imports.filter((row) => row.status === "skipped"),
    done: imports.filter((row) => row.status === "imported" || row.status === "merged"),
  }
  const visible = lists[view]
  const currentIndex = Math.max(0, visible.findIndex((row) => row.drive_file_id === selected))
  const current = visible[currentIndex] ?? null

  const move = (step: number) => {
    const target = visible[currentIndex + step]
    if (target) setSelected(target.drive_file_id)
  }

  // Copies and imported runs' videos are processed on the server, so check
  // back while any are left.
  useEffect(() => {
    if (!copying) return
    const timer = window.setInterval(refetch, 20 * 1000)
    return () => window.clearInterval(timer)
  }, [copying, refetch])

  const setQueue = (next: QueueData) => setApiData(QUEUE_URL, { ...data, data: next })

  // The file leaves this list, so the next one takes its place.
  // A name-only import's new placeholder becomes the match for the other
  // files with that name.
  const resolved = (row: ImportRow, changes: Partial<ImportRow>, created?: ImportPlayer | null) => {
    if (!queue) return
    const following = visible[currentIndex + 1] ?? visible[currentIndex - 1] ?? null
    const named = (entry: ImportRow) =>
      Boolean(created && entry.status === "pending" && entry.parsed.player?.toLowerCase() === created.player_name.toLowerCase() && !entry.players.some((other) => other.uuid === created.uuid))
    setQueue({
      ...queue,
      imports: queue.imports.map((entry) =>
        entry.drive_file_id === row.drive_file_id ? { ...entry, ...changes } : created && named(entry) ? { ...entry, players: [...entry.players, created] } : entry
      ),
    })
    setSelected(following?.drive_file_id ?? null)
  }

  const versionsChanged = (versions: GameVersion[]) => {
    if (queue) setQueue({ ...queue, versions })
    setApiData(VERSIONS_URL, { data: { versions } })
  }

  return (
    <AdminPage
      title="WR Drive import"
      description="World records from the old Google Drive folder, oldest first. Check what each file’s name says, pick the player and the version, and import it. If the site already has the run, it’s matched instead: the site’s run stays and is backdated to the Drive’s date. Nothing here changes anyone’s score."
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
          <DriveCard queue={queue} onChanged={refetch} />

          {imports.length > 0 ? (
            <div role="group" aria-label="Show" className="flex flex-wrap gap-0.5 self-start rounded-md border border-line-strong p-0.5">
              {(
                [
                  { value: "review", label: "To review" },
                  { value: "player", label: "Needs a player" },
                  { value: "skipped", label: "Skipped" },
                  { value: "done", label: "Done" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => {
                    setView(option.value)
                    setSelected(null)
                  }}
                  className={cn(
                    "label-caps flex h-8 items-center gap-1.5 rounded px-3 text-[14px] transition-colors",
                    view === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                  <span className="num text-[12px] tracking-normal opacity-70">{formatCount(lists[option.value].length)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {imports.length === 0 ? (
            <AdminEmpty>Nothing scanned yet. Scan the Drive folder to fill the queue.</AdminEmpty>
          ) : !current ? (
            <AdminEmpty>
              {view === "review" ? "Every file is handled." : view === "player" ? "Every file has its player." : view === "skipped" ? "No skipped files." : "Nothing imported yet."}
            </AdminEmpty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
              <ol aria-label="Drive files" className="order-2 m-0 flex max-h-[70vh] list-none flex-col overflow-y-auto border-t border-line p-0 lg:order-1">
                {visible.map((row) => (
                  <li key={row.drive_file_id}>
                    <button
                      type="button"
                      aria-current={row.drive_file_id === current.drive_file_id ? "true" : undefined}
                      onClick={() => setSelected(row.drive_file_id)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                        row.drive_file_id === current.drive_file_id && "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]"
                      )}
                    >
                      <span className={cn("truncate text-[15px] font-medium", !row.parsed.trial && "text-gold")}>{rowLabel(row)}</span>
                      <span className="text-right text-[12px] text-subtle-foreground">{row.date ? formatDate(row.date) : "No date"}</span>
                      <span className={cn("truncate text-[13px]", row.status === "pending" && row.players.length !== 1 ? "text-gold" : "text-muted-foreground")}>
                        {row.parsed.player ?? "No player in the name"}
                      </span>
                      <span className={cn("text-right text-[12px]", row.copy_error || row.video_status === "failed" ? "text-destructive" : "text-subtle-foreground")}>
                        {row.video_status === "failed" ? "Video failed" : row.video_status === "processing" ? "Processing" : row.status === "imported" ? "Imported" : row.status === "merged" ? "Matched" : row.status === "skipped" ? "Skipped" : row.staged ? "Ready" : row.copy_error ? "Copy failed" : row.copying ? "Copying" : "Waiting"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

              <section aria-label="Drive file" className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
                {current.status === "pending" ? (
                  <ImportDetail
                    key={current.drive_file_id}
                    row={current}
                    trials={queue.trials}
                    versions={queue.versions}
                    lastVersion={lastVersion}
                    onVersionsChanged={versionsChanged}
                    onResolved={(changes, version, created) => {
                      if (version) setLastVersion(version)
                      resolved(current, changes, created)
                    }}
                    canPrev={currentIndex > 0}
                    canNext={currentIndex < visible.length - 1}
                    onMove={move}
                  />
                ) : (
                  <ResolvedDetail row={current} onRestored={() => resolved(current, { status: "pending", staged: false, copying: false })} />
                )}
              </section>
            </div>
          )}
        </>
      ) : null}
    </AdminPage>
  )
}

// Scanning the folder, and copying its files over while the page is open.
function DriveCard({ queue, onChanged }: { queue: QueueData; onChanged: () => void }) {
  const [folder, setFolder] = useState(queue.default_folder)
  const [scanning, setScanning] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const pending = queue.imports.filter((row) => row.status === "pending")
  const failedVideos = queue.imports.filter((row) => row.video_status === "failed").length
  const copied = pending.filter((row) => row.staged).length
  const failed = pending.filter((row) => !row.staged && row.copy_error).length
  const inProgress = pending.filter((row) => row.copying).length

  const scan = async () => {
    setScanning(true)
    try {
      const result = await adminRequest<{ folders: number; videos: number; added: number; ignored: number }>("/admin/wr-imports/scan", {
        body: { folder },
        fallback: "Couldn’t scan the folder",
      })
      toast.success(
        `Found ${formatCount(result?.videos ?? 0)} videos in ${formatCount(result?.folders ?? 0)} ${result?.folders === 1 ? "folder" : "folders"}, ${formatCount(result?.added ?? 0)} new.` +
          (result?.ignored ? ` ${formatCount(result.ignored)} other files left out.` : "")
      )
      onChanged()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t scan the folder"))
    } finally {
      setScanning(false)
    }
  }

  // Failed copies go back in line. The rest copy on their own.
  const retry = async () => {
    setRetrying(true)
    try {
      await adminRequest("/admin/wr-imports/copy", { fallback: "Couldn’t retry the copies" })
      toast.success(`Copying ${formatCount(failed)} ${failed === 1 ? "file" : "files"} again`)
      onChanged()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t retry the copies"))
    } finally {
      setRetrying(false)
    }
  }

  // Imported runs whose video failed are processed again from their
  // archived original.
  const reprocess = async () => {
    setReprocessing(true)
    try {
      const result = await adminRequest<{ queued: number; missing: number }>("/admin/wr-imports/reprocess", { fallback: "Couldn’t reprocess the videos" })
      const queued = result?.queued ?? 0
      toast.success(
        `Processing ${formatCount(queued)} ${queued === 1 ? "video" : "videos"} again` +
          (result?.missing ? `. ${formatCount(result.missing)} ${result.missing === 1 ? "has" : "have"} no file to process.` : "")
      )
      onChanged()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t reprocess the videos"))
    } finally {
      setReprocessing(false)
    }
  }

  return (
    <AdminCard className="flex flex-col gap-4 p-4">
      {!queue.configured ? (
        <p className="m-0 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-[13px]">
          Reading the Drive needs a Google API key with the Google Drive API turned on, saved as the{" "}
          <code className="text-[12px]">GOOGLE_DRIVE_API_KEY</code> secret on both the site and the video worker (
          <code className="text-[12px]">npx wrangler secret put GOOGLE_DRIVE_API_KEY</code>, then again in <code className="text-[12px]">video-worker/</code>). The
          folder has to open in a private window without signing in.
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void scan()
        }}
      >
        <Input value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Drive folder link" className="h-10 min-w-0 flex-[1_1_20rem]" />
        <Button type="submit" variant="outline" disabled={scanning || !queue.configured || !folder.trim()}>
          {scanning ? <Spinner className="size-4" /> : <FolderSearchIcon />}
          Scan Drive
        </Button>
      </form>
      {pending.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex-1 text-[13px] text-muted-foreground">
            <span className="num text-foreground">{formatCount(copied)}</span> of {formatCount(pending.length)} files to review are copied and re-encoded
            {inProgress > 0 ? <>, {formatCount(inProgress)} copying now</> : null}
            {failed > 0 ? <span className="text-destructive">, {formatCount(failed)} failed</span> : null}. The video worker copies them straight from the
            Drive, a few at a time, whether or not this page is open.
          </span>
          {failed > 0 ? (
            <Button type="button" variant="outline" onClick={() => void retry()} disabled={retrying || !queue.configured}>
              {retrying ? <Spinner className="size-4" /> : <CloudDownloadIcon />}
              Retry {formatCount(failed)} failed
            </Button>
          ) : null}
        </div>
      ) : null}
      {failedVideos > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex-1 text-[13px] text-muted-foreground">
            <span className="text-destructive">
              {formatCount(failedVideos)} imported {failedVideos === 1 ? "run’s video" : "runs’ videos"} failed to process
            </span>
            . Their files are safe in the archive, so they can be processed again from there.
          </span>
          <Button type="button" variant="outline" onClick={() => void reprocess()} disabled={reprocessing}>
            {reprocessing ? <Spinner className="size-4" /> : <RefreshCwIcon />}
            Reprocess {formatCount(failedVideos)} failed
          </Button>
        </div>
      ) : null}
    </AdminCard>
  )
}

function FilePreview({ row }: { row: ImportRow }) {
  const [failed, setFailed] = useState(false)
  if (row.staged && !failed) {
    // No filmstrip: it would download each file a second time.
    return (
      <VideoPlayer
        src={apiV2(`/admin/wr-imports/${encodeURIComponent(row.drive_file_id)}/file`)}
        label={row.file_name}
        previews={false}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line-strong bg-black">
      <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {failed
            ? "This file can’t play in the browser."
            : row.copy_error
              ? `Copying it failed: ${row.copy_error}`
              : row.copying
                ? "Copying the file from the Drive and re-encoding it so it plays here. This usually takes a minute or two."
                : "Waiting to be copied from the Drive."}
        </p>
        <a href={driveFileUrl(row.drive_file_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4">
          Watch it in Drive <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  )
}

function FileFacts({ row }: { row: ImportRow }) {
  return (
    <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
      <span className="break-words text-[14px] text-foreground">{row.file_name}</span>
      <span className="flex flex-wrap gap-x-3">
        <span>{row.folder_path ? `In ${row.folder_path}` : "In the top folder"}</span>
        <span>{formatBytes(row.size)}</span>
        <a href={driveFileUrl(row.drive_file_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          Drive <ExternalLinkIcon className="size-3" aria-hidden />
        </a>
      </span>
    </div>
  )
}

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps text-[13px] text-subtle-foreground">{label}</span>
      {children}
      {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

function ImportDetail({
  row,
  trials,
  versions,
  lastVersion,
  onVersionsChanged,
  onResolved,
  canPrev,
  canNext,
  onMove,
}: {
  row: ImportRow
  trials: string[]
  versions: GameVersion[]
  lastVersion: string | null
  onVersionsChanged: (versions: GameVersion[]) => void
  onResolved: (changes: Partial<ImportRow>, version: string | null, created?: ImportPlayer | null) => void
  canPrev: boolean
  canNext: boolean
  onMove: (step: number) => void
}) {
  const [trial, setTrial] = useState(row.parsed.trial ?? "")
  const [timeText, setTimeText] = useState(row.parsed.time !== null ? formatTime(row.parsed.time) : "")
  const [player, setPlayerState] = useState<ImportPlayer | null>(row.players.length === 1 ? row.players[0] : null)
  // Set for a player with no account: the name the run goes under.
  const [nameOnly, setNameOnly] = useState<string | null>(null)
  const setPlayer = (next: ImportPlayer | null) => {
    setPlayerState(next)
    setNameOnly(null)
  }
  const [dateText, setDateText] = useState(row.date ? toLocalInput(row.date) : "")
  const [picked, setPicked] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<"save" | "skip" | null>(null)
  // A run on the site the server found when saving, for a trial or time
  // typed in by hand (the queue only looks up what the name says).
  const [found, setFound] = useState<{ match: ImportMatch; trial: string; ms: number } | null>(null)

  const time = parseRunTime(timeText)
  const date = fromLocalInput(dateText)
  const asNamed = trial === row.parsed.trial && time !== null && row.parsed.time !== null && timeMs(time) === timeMs(row.parsed.time)
  const known = asNamed ? row.matches : found && found.trial === trial && time !== null && found.ms === timeMs(time) ? [found.match] : []
  const match = player ? (known.find((run) => run.player_uuid === player.uuid) ?? null) : null
  const others = known.filter((run) => run.player_uuid !== player?.uuid)
  const version = picked ?? match?.game_version ?? row.version ?? lastVersion
  const nameText = nameOnly?.trim() ?? ""
  const ready = Boolean(trial && time !== null && (player || nameText.length >= 2) && date !== null && version && (match || row.staged))
  const backdates = Boolean(match && date !== null && date < match.date)

  const save = async () => {
    if (!ready || busy || time === null || date === null || !version) return
    const who = player?.player_name ?? nameText
    setBusy("save")
    try {
      const response = await fetch(apiV2(`/admin/wr-imports/${encodeURIComponent(row.drive_file_id)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: match ? "match" : "import",
          submission_uuid: match?.uuid,
          trial,
          time,
          ...(player ? { player_uuid: player.uuid } : { player_name: nameText }),
          version,
          date,
        }),
      })
      const json = (await response.json().catch(() => null)) as { data?: SaveResult; error?: { message?: string; details?: { match?: ImportMatch } | null } } | null
      const existing = json?.error?.details?.match
      if (response.status === 409 && existing) {
        setFound({ match: existing, trial, ms: timeMs(time) })
        toast.message("The site already has this run. Check it, then save again to match it.")
        return
      }
      if (!response.ok || !json?.data) throw new Error(json?.error?.message || "Couldn’t save")
      const result = json.data
      const imported = result.status !== "merged"
      onResolved(
        { status: imported ? "imported" : "merged", submission_uuid: result.submission_uuid ?? null, video_status: imported ? "processing" : null },
        version,
        result.player
      )
      toast.success(
        result.status === "merged"
          ? `Matched to the site’s run${result.backdated ? " and backdated it" : ""}`
          : `Imported ${trial} ${formatTime(time)} by ${who}. It shows in the archive once its video is processed.`
      )
    } catch (err) {
      toast.error(errorText(err, "Couldn’t save"))
    } finally {
      setBusy(null)
    }
  }

  const skip = async () => {
    if (busy) return
    setBusy("skip")
    try {
      await adminRequest(`/admin/wr-imports/${encodeURIComponent(row.drive_file_id)}`, { body: { action: "skip" }, fallback: "Couldn’t skip it" })
      onResolved({ status: "skipped", staged: false }, null)
    } catch (err) {
      toast.error(errorText(err, "Couldn’t skip it"))
    } finally {
      setBusy(null)
    }
  }

  // Number keys pick a version (highest is 1), N adds one, Enter saves, S
  // skips, J and K move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      const key = event.key.toLowerCase()
      const index = Number(key) - 1
      if (Number.isInteger(index) && index >= 0 && index < Math.min(9, versions.length)) setPicked(versions[index].name)
      else if (key === "enter") void save()
      else if (key === "n") setCreating(true)
      else if (key === "s") void skip()
      else if (key === "j") onMove(1)
      else if (key === "k") onMove(-1)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const name = row.parsed.player
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[40px] font-extrabold uppercase leading-[0.9] md:text-[56px]">{trial || row.parsed.trialText || "Unknown trial"}</span>
          <span className="num text-[32px] font-semibold leading-none md:text-[44px]">{time !== null ? formatTime(time) : "—"}</span>
        </h2>
        <FileFacts row={row} />
      </div>

      <FilePreview row={row} />

      <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
        <Field label="Trial" note={!row.parsed.trial ? `“${row.parsed.trialText || row.file_name}” isn’t a trial on the site. Pick it, or skip the file.` : undefined}>
          <NativeSelect value={trial} onChange={(event) => setTrial(event.target.value)} aria-label="Trial" className="[&_select]:h-10">
            <NativeSelectOption value="">Pick a trial</NativeSelectOption>
            {trials.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Time" note={timeText && time === null ? "Seconds, like 45.123 or 1:05.123" : undefined}>
          <Input value={timeText} onChange={(event) => setTimeText(event.target.value)} inputMode="decimal" aria-label="Time" aria-invalid={Boolean(timeText) && time === null} className="num h-10" />
        </Field>
        <Field
          label="Player"
          note={
            nameOnly !== null
              ? "The run goes under this name, with no account. If they sign up later, move it to their account from the Players page."
              : !name
                ? "The name doesn’t say who. Search for them."
                : row.players.length === 0
                  ? `No player is called “${name}”. Search for them, or import it under just the name.`
                  : row.players.length > 1
                    ? `“${name}” could be ${row.players.length} players. Pick the right one.`
                    : player?.uuid === row.players[0].uuid
                      ? row.players[0].placeholder
                        ? `Matched “${name}”, who has no account`
                        : `Matched “${name}”`
                      : undefined
          }
        >
          {nameOnly !== null ? (
            <div className="flex gap-2">
              <Input
                value={nameOnly}
                onChange={(event) => setNameOnly(event.target.value)}
                aria-label="Player name"
                aria-invalid={nameText.length < 2}
                autoFocus
                className="h-10 min-w-0 flex-1"
              />
              <Button type="button" variant="outline" className="h-10" onClick={() => setNameOnly(null)}>
                Pick an account
              </Button>
            </div>
          ) : (
            <PlayerPicker value={player} onChange={setPlayer} placeholder={name ? `Search for ${name}` : "Search players"} label="Player" />
          )}
          {nameOnly === null && row.players.length > 1 ? (
            <span className="flex flex-wrap gap-1.5">
              {row.players.map((candidate) => (
                <button
                  key={candidate.uuid}
                  type="button"
                  onClick={() => setPlayer(candidate)}
                  aria-pressed={player?.uuid === candidate.uuid}
                  className={cn(
                    "h-8 rounded-md border px-2.5 text-[13px] transition-colors",
                    player?.uuid === candidate.uuid ? "border-primary bg-primary/15" : "border-line-strong text-muted-foreground hover:text-foreground"
                  )}
                >
                  {candidate.player_name}
                  {candidate.placeholder ? <span className="ml-1 text-subtle-foreground">(no account)</span> : null}
                </button>
              ))}
            </span>
          ) : null}
          {nameOnly === null && !player?.placeholder ? (
            <button
              type="button"
              onClick={() => {
                setPlayerState(null)
                setNameOnly(name ?? "")
              }}
              className="self-start text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              No account? Import it under just a name
            </button>
          ) : null}
        </Field>
        <Field
          label="Set on"
          note={
            <>
              Drive: uploaded {row.drive_created_at ? formatDate(row.drive_created_at) : "—"}, modified {row.drive_modified_at ? formatDate(row.drive_modified_at) : "—"}
            </>
          }
        >
          <Input type="datetime-local" value={dateText} onChange={(event) => setDateText(event.target.value)} aria-label="Set on" className="h-10" />
        </Field>
        <div className="flex flex-col gap-2.5 sm:col-span-2">
          <span className="label-caps text-[13px] text-subtle-foreground">Version</span>
          <div className="flex flex-wrap items-center gap-2">
            <VersionChoices versions={versions} choice={version} onPick={setPicked} />
            <NewVersion
              open={creating}
              onOpenChange={setCreating}
              onCreated={(created, list) => {
                onVersionsChanged(list)
                setPicked(created)
                setCreating(false)
              }}
            />
          </div>
          {versions.length === 0 && !creating ? <p className="m-0 text-[13px] text-muted-foreground">No versions yet. Add the one this record was played on.</p> : null}
        </div>
      </div>

      {match ? (
        <div className="flex flex-col gap-1 rounded-lg border border-primary/50 bg-primary/10 p-4 text-[14px]">
          <span className="font-medium">The site already has this run</span>
          <span className="text-muted-foreground">
            {trial} {formatTime(time)} by {match.player_name}, set {formatDate(match.date)}
            {match.imported ? ", imported from another copy in the Drive" : ""}.{" "}
            {backdates ? `Saving keeps it and backdates it to ${formatDate(date ?? 0)}.` : "Saving keeps it as it is: the Drive’s date isn’t earlier."}{" "}
            <Link href={`/submissions/${encodeURIComponent(match.uuid)}`} target="_blank" className="inline-flex items-center gap-1 underline underline-offset-4">
              Run page <ExternalLinkIcon className="size-3" aria-hidden />
            </Link>
          </span>
        </div>
      ) : others.length > 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          The site has this trial and time by {others.map((run) => run.player_name).join(", ")}.{" "}
          {others.length === 1 ? (
            <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setPlayer({ uuid: others[0].player_uuid, player_name: others[0].player_name, score: others[0].player_score })}>
              Is it {others[0].player_name}?
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" onClick={() => void save()} disabled={!ready || busy !== null}>
          {busy === "save" ? <Spinner className="size-4" /> : <CheckIcon />}
          {match ? (backdates ? "Match and backdate" : "Match") : "Import"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => void skip()} disabled={busy !== null}>
          {busy === "skip" ? <Spinner className="size-4" /> : <SkipForwardIcon />}
          Skip
        </Button>
        <span className="hidden text-[13px] text-subtle-foreground xl:inline">
          {!row.staged && !match ? "Importing waits for the file to be copied. " : ""}Keys: 1–9 pick a version, N adds one, Enter saves, S skips, J and K move.
        </span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="icon-lg" aria-label="Previous (K)" disabled={!canPrev} onClick={() => onMove(-1)}>
            <ChevronUpIcon />
          </Button>
          <Button type="button" variant="outline" size="icon-lg" aria-label="Next (J)" disabled={!canNext} onClick={() => onMove(1)}>
            <ChevronDownIcon />
          </Button>
        </div>
      </div>
    </>
  )
}

function ResolvedDetail({ row, onRestored }: { row: ImportRow; onRestored: () => void }) {
  const [busy, setBusy] = useState(false)

  const restore = async () => {
    setBusy(true)
    try {
      await adminRequest(`/admin/wr-imports/${encodeURIComponent(row.drive_file_id)}`, { body: { action: "restore" }, fallback: "Couldn’t put it back" })
      onRestored()
      toast.success("Back in the queue. It’s copied from the Drive again first.")
    } catch (err) {
      toast.error(errorText(err, "Couldn’t put it back"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[40px] font-extrabold uppercase leading-[0.9] md:text-[56px]">{rowLabel(row)}</h2>
        <FileFacts row={row} />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4 text-[14px]">
        <span className="flex-1">
          {row.status === "imported" ? "Imported as a run." : row.status === "merged" ? "Matched to a run the site already had." : "Skipped."}
          {row.video_status === "failed" ? (
            <span className="text-destructive"> Its video failed to process{row.video_error ? `: ${row.video_error}` : "."}</span>
          ) : row.video_status === "processing" ? (
            " Its video is being processed."
          ) : null}
        </span>
        {row.submission_uuid ? (
          <Button asChild variant="outline">
            <Link href={`/submissions/${encodeURIComponent(row.submission_uuid)}`}>
              <ExternalLinkIcon />
              Run page
            </Link>
          </Button>
        ) : null}
        {row.status === "skipped" ? (
          <Button type="button" variant="outline" onClick={() => void restore()} disabled={busy}>
            {busy ? <Spinner className="size-4" /> : <RotateCcwIcon />}
            Put back in the queue
          </Button>
        ) : null}
      </div>
    </>
  )
}
