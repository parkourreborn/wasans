"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CalculatorIcon, CheckIcon, LinkIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import type { AuthSessionUser } from "@/lib/auth-session"
import { uploadVideoFile, validateVideoFile, VIDEO_FILE_ACCEPT } from "@/lib/direct-upload"
import { formatDelta, formatScore, formatTime } from "@/lib/format"
import { calculateFinalTime, formatThousandths } from "@/lib/hudzell-time"
import { refreshRunCaches } from "@/lib/moderation"
import { estimateScore } from "@/lib/score-estimate"
import {
  formatFileSize,
  isMedalClipUrl,
  MAX_RUNS_PER_SUBMISSION,
  parseRunFilename,
  parseRunTime,
  TIME_DRAFT_PATTERN,
} from "@/lib/submission-input"
import { getSubmissionErrorMessage } from "@/lib/submission-errors"
import type { TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { invalidateApi, useApi } from "@/hooks/use-api"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { refreshV2AccessToken } from "@/components/custom/v2-auth-refresh"
import type { WorldRecordsResponse } from "@/components/site/trials-index"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

// An upload can be used for six hours; reuse one for a retry well inside that.
const UPLOAD_REUSE_MS = 5 * 60 * 60 * 1000

// Only ever called from the submit handler, never while rendering.
function uploadIsFresh(at: number) {
  return Date.now() - at < UPLOAD_REUSE_MS
}

function uploadTimestamp() {
  return Date.now()
}

type RunDraft = {
  id: string
  trial: TrialName | ""
  time: string
  mode: "file" | "link"
  file: File | null
  fileError: string | null
  previewUrl: string | null
  link: string
  // The trial or time was read from the file name, so ask the player to check.
  autoFilled: boolean
}

type PlayerPb = { trial_name: string; time: number; submission_uuid: string }
type PlayerDetailResponse = { data?: { player?: { score?: number; pbs?: PlayerPb[] } | null } }
type CreatedRun = { uuid: string; trial_name: string; video_status: string }
type CreateResponse = { data?: { results?: CreatedRun[] }; error?: { message?: string } }

type Phase = "editing" | "uploading" | "creating"

let draftSequence = 1

function newDraft(id?: string): RunDraft {
  draftSequence += 1
  return {
    id: id ?? `run-${draftSequence}`,
    trial: "",
    time: "",
    mode: "file",
    file: null,
    fileError: null,
    previewUrl: null,
    link: "",
    autoFilled: false,
  }
}

function isBlank(draft: RunDraft) {
  return !draft.trial && !draft.time && !draft.file && !draft.link
}

// Applies a chosen video to a run: checks it, previews it, and fills in the
// trial and time from its name where the player hasn't yet.
function withFile(draft: RunDraft, file: File): RunDraft {
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
  const fileError = validateVideoFile(file)
  if (fileError) {
    return { ...draft, file: null, fileError, previewUrl: null }
  }
  const parsed = parseRunFilename(file.name)
  const trial = draft.trial || parsed.trialName || ""
  const time = draft.time || parsed.time || ""
  return {
    ...draft,
    mode: "file",
    file,
    fileError: null,
    previewUrl: URL.createObjectURL(file),
    trial,
    time,
    autoFilled: (!draft.trial && Boolean(parsed.trialName)) || (!draft.time && Boolean(parsed.time)),
  }
}

type Issues = { trial?: string; time?: string; proof?: string; slower?: string }

function issuesFor(draft: RunDraft, pbs: Map<string, number>): Issues {
  const issues: Issues = {}
  const time = parseRunTime(draft.time)
  if (!draft.trial) issues.trial = "Choose the trial."
  if (!draft.time.trim()) issues.time = "Enter the time."
  else if (time === null) issues.time = "Use a positive time with up to three decimals, e.g. 12.345."
  const pb = draft.trial ? pbs.get(draft.trial) : undefined
  if (time !== null && pb !== undefined && time > pb) {
    issues.slower = `Slower than your PB of ${formatTime(pb)}. Only new PBs can be submitted.`
  }
  if (draft.mode === "file") {
    if (draft.fileError) issues.proof = draft.fileError
    else if (!draft.file) issues.proof = "Add the video of the run."
  } else if (!draft.link.trim()) {
    issues.proof = "Paste the Medal clip link."
  } else if (!isMedalClipUrl(draft.link)) {
    issues.proof = "That isn't a Medal clip link. It looks like https://medal.tv/games/roblox/clips/…"
  }
  return issues
}

export function TrialRunsForm({ user, blocked }: { user: AuthSessionUser; blocked: boolean }) {
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const openTrials = orderedTrialNames.filter((trial) => !removedTrials.has(trial))
  const { data: wrData } = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const playerUrl = apiV2(`/players/${encodeURIComponent(user.uuid)}?include=pbs`)
  const { data: playerData } = useApi<PlayerDetailResponse>(playerUrl)
  const records = wrData?.data ?? []
  const pbList = playerData?.data?.player?.pbs ?? []
  const pbs = new Map(pbList.map((pb) => [pb.trial_name, Number(pb.time)]))
  const wrs = new Map(records.map((record) => [record.trial_name, record]))
  const score = Number(playerData?.data?.player?.score ?? user.score ?? 0)

  const [drafts, setDrafts] = useState<RunDraft[]>(() => [newDraft("run-1")])
  const [phase, setPhase] = useState<Phase>("editing")
  const [attempted, setAttempted] = useState(false)
  const [runErrors, setRunErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedRun[] | null>(null)
  const [dragging, setDragging] = useState(false)
  // Which runs' videos are already uploaded (the ids themselves live in the
  // ref, read only when submitting).
  const [uploaded, setUploaded] = useState<Record<string, true>>({})
  const uploads = useRef(new Map<string, { id: string; at: number; file: File }>())
  const abort = useRef<AbortController | null>(null)
  const latestDrafts = useRef(drafts)

  // Free the local previews when the page goes away.
  useEffect(() => {
    latestDrafts.current = drafts
  }, [drafts])
  useEffect(() => {
    return () => {
      for (const draft of latestDrafts.current) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      }
      abort.current?.abort()
    }
  }, [])

  const busy = phase !== "editing"
  const hasUnsentVideo = drafts.some((draft) => draft.file)

  // Leaving mid-upload, or with videos picked but not sent, loses them.
  useEffect(() => {
    if (!busy && !hasUnsentVideo) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older Safari only asks when returnValue is set.
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [busy, hasUnsentVideo])

  const issues = drafts.map((draft) => issuesFor(draft, pbs))
  const ready = drafts.every((_, index) => Object.keys(issues[index]).length === 0)
  const estimate = estimateScore(
    pbList,
    records,
    score,
    drafts.flatMap((draft) => {
      const time = parseRunTime(draft.time)
      return draft.trial && time !== null ? [{ trial: draft.trial, time }] : []
    })
  )
  const fileBytes = drafts.reduce((total, draft) => total + (draft.mode === "file" && draft.file ? draft.file.size : 0), 0)
  const sentBytes = drafts.reduce((total, draft) => {
    if (draft.mode !== "file" || !draft.file) return total
    return total + (uploaded[draft.id] ? draft.file.size : (progress[draft.id] ?? 0))
  }, 0)

  const update = (id: string, change: (draft: RunDraft) => RunDraft) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? change(draft) : draft)))
    setRunErrors((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const forgetUpload = (id: string) => {
    uploads.current.delete(id)
    setUploaded((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const setFile = (id: string, file: File | null) => {
    forgetUpload(id)
    update(id, (draft) => {
      if (file) return withFile(draft, file)
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      return { ...draft, file: null, fileError: null, previewUrl: null, autoFilled: false }
    })
  }

  // Several videos dropped at once become one run each.
  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    setDrafts((current) => {
      const next = [...current]
      for (const file of files) {
        const blankIndex = next.findIndex(isBlank)
        if (blankIndex >= 0) {
          next[blankIndex] = withFile(next[blankIndex], file)
        } else if (next.length < MAX_RUNS_PER_SUBMISSION) {
          next.push(withFile(newDraft(), file))
        }
      }
      return next
    })
  }

  // The first video goes to this run; any others become runs of their own.
  const placeFiles = (id: string, files: File[]) => {
    const [first, ...rest] = files
    if (!first) return
    setFile(id, first)
    addFiles(rest)
  }

  const removeDraft = (id: string) => {
    forgetUpload(id)
    setDrafts((current) => {
      const target = current.find((draft) => draft.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      const rest = current.filter((draft) => draft.id !== id)
      return rest.length > 0 ? rest : [newDraft()]
    })
  }

  const cancel = () => {
    abort.current?.abort()
  }

  const submit = async () => {
    setAttempted(true)
    setFormError(null)
    if (!ready || blocked || busy) {
      if (!ready) {
        const first = drafts.findIndex((_, index) => Object.keys(issues[index]).length > 0)
        document.getElementById(`run-card-${drafts[first]?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }

    const batch = drafts
    const controller = new AbortController()
    abort.current = controller
    setPhase("uploading")
    setRunErrors({})
    // A fresh access token for the whole upload, so the request at the end
    // of a long one doesn't start with an expired token.
    await refreshV2AccessToken().catch(() => false)

    for (const draft of batch) {
      if (draft.mode !== "file" || !draft.file) continue
      const cached = uploads.current.get(draft.id)
      if (cached && cached.file === draft.file && uploadIsFresh(cached.at)) continue
      setUploading(draft.id)
      try {
        const file = draft.file
        const id = await uploadVideoFile(file, (loaded) => setProgress((current) => ({ ...current, [draft.id]: loaded })), controller.signal)
        uploads.current.set(draft.id, { id, at: uploadTimestamp(), file })
        setUploaded((current) => ({ ...current, [draft.id]: true }))
      } catch (error) {
        setUploading(null)
        setPhase("editing")
        if (controller.signal.aborted) {
          setFormError("Upload cancelled. Videos that finished uploading won't need to upload again.")
        } else {
          setRunErrors({ [draft.id]: error instanceof Error ? error.message : "The upload failed. Try again." })
        }
        return
      }
    }
    setUploading(null)
    setPhase("creating")

    try {
      const response = await fetch(apiV2("/submissions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissions: batch.map((draft) => {
            const upload = draft.mode === "file" ? uploads.current.get(draft.id) : undefined
            return {
              trial_name: draft.trial,
              time: draft.time.trim(),
              proof_url: upload ? "" : draft.link.trim(),
              upload_id: upload?.id ?? null,
            }
          }),
        }),
      })
      const json = (await response.json().catch(() => null)) as CreateResponse | null
      if (!response.ok) {
        const message = getSubmissionErrorMessage(json?.error, "Couldn't create the submissions. Try again.")
        // "Submission 2 is slower than…" belongs on run 2.
        const match = message.match(/^Submission (\d+)/)
        const target = match ? batch[Number(match[1]) - 1] : undefined
        if (target) {
          if (/upload/i.test(message)) forgetUpload(target.id)
          setRunErrors({ [target.id]: message.replace(/^Submission \d+('s)? ?/, (_, possessive) => (possessive ? "This run's " : "This run ")) })
        } else {
          setFormError(message)
        }
        setPhase("editing")
        return
      }
      for (const draft of batch) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      }
      uploads.current.clear()
      setUploaded({})
      refreshRunCaches("trial")
      invalidateApi(playerUrl)
      setCreated(json?.data?.results ?? [])
      setDrafts([newDraft()])
      setProgress({})
      setAttempted(false)
      setPhase("editing")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      setFormError("Couldn't reach the server. Your videos are uploaded, so submitting again is quick.")
      setPhase("editing")
    }
  }

  if (created) {
    return <SubmitSuccess runs={created} playerUuid={user.uuid} onMore={() => setCreated(null)} />
  }

  const runWord = drafts.length === 1 ? "run" : "runs"
  const gain = estimate.after - estimate.before

  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      onDragOver={(event) => {
        if (busy || !event.dataTransfer.types.includes("Files")) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (busy || !event.dataTransfer.files.length) return
        event.preventDefault()
        setDragging(false)
        addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <RulesReminder />
        {formError ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Runs">
          {drafts.map((draft, index) => (
            <li key={draft.id}>
              <RunCard
                draft={draft}
                index={index}
                count={drafts.length}
                trials={openTrials}
                pbs={pbs}
                wr={draft.trial ? wrs.get(draft.trial) : undefined}
                issues={issues[index]}
                showAll={attempted}
                serverError={runErrors[draft.id]}
                duplicate={Boolean(draft.trial) && drafts.some((other) => other.id !== draft.id && other.trial === draft.trial)}
                perTrial={draft.trial ? estimate.perTrial.get(draft.trial) : undefined}
                trialScore={estimate.trialScore}
                busy={busy}
                uploadState={
                  uploading === draft.id
                    ? { loaded: progress[draft.id] ?? 0, total: draft.file?.size ?? 0 }
                    : uploaded[draft.id] && busy
                      ? "done"
                      : null
                }
                onChange={(change) => update(draft.id, change)}
                onFile={(file) => setFile(draft.id, file)}
                onFiles={(files) => placeFiles(draft.id, files)}
                onRemove={() => removeDraft(draft.id)}
              />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || drafts.length >= MAX_RUNS_PER_SUBMISSION}
            onClick={() => setDrafts((current) => [...current, newDraft()])}
          >
            <PlusIcon />
            Add another run
          </Button>
          <span className="text-[13px] text-subtle-foreground">
            {dragging ? "Drop to add the videos" : "Tip: pick or drop several videos at once and each becomes a run."}
          </span>
        </div>
      </div>

      <aside
        aria-label="Submit"
        className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 lg:top-20 lg:mx-0 lg:gap-4 lg:rounded-lg lg:border lg:bg-surface lg:p-4"
      >
        <div className="hidden flex-col gap-1 lg:flex">
          <span className="label-caps text-[13px] text-subtle-foreground">Ready to send</span>
          <span className="text-sm text-muted-foreground">
            {drafts.length} {runWord}
            {fileBytes > 0 ? `, ${formatFileSize(fileBytes)} to upload` : ""}
          </span>
        </div>
        {gain >= 0.0005 ? (
          <div className="flex items-baseline justify-between gap-3 lg:flex-col lg:items-start lg:gap-1">
            <span className="label-caps text-[13px] text-subtle-foreground">Your score once approved</span>
            <span className="flex items-baseline gap-2">
              <span className="num text-sm text-muted-foreground">{formatScore(estimate.before)}</span>
              <span className="text-subtle-foreground" aria-label="to">→</span>
              <span className="num text-[20px] font-semibold">{formatScore(estimate.after)}</span>
              <span className="num text-[13px] text-success">{formatDelta(gain)}</span>
            </span>
          </div>
        ) : null}

        {phase === "uploading" ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                Uploading {Math.max(1, drafts.findIndex((draft) => draft.id === uploading) + 1)} of {drafts.length}
              </span>
              <span className="num text-muted-foreground">{fileBytes > 0 ? Math.round((sentBytes / fileBytes) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-surface-3" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fileBytes > 0 ? Math.round((sentBytes / fileBytes) * 100) : 0}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${fileBytes > 0 ? (sentBytes / fileBytes) * 100 : 0}%` }} />
            </div>
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel upload
            </Button>
          </div>
        ) : (
          <Button type="button" size="lg" className="w-full" disabled={blocked || busy} onClick={() => void submit()}>
            {phase === "creating" ? <Spinner className="size-4" /> : <UploadIcon />}
            {phase === "creating" ? "Submitting…" : `Submit ${drafts.length > 1 ? `${drafts.length} runs` : "run"}`}
          </Button>
        )}
        {attempted && !ready && !busy ? (
          <p className="text-[13px] text-destructive">Some runs need fixing first. They&apos;re marked above.</p>
        ) : (
          <p className="hidden text-[13px] leading-relaxed text-subtle-foreground lg:block">
            Runs start as pending until a moderator checks the video. You&apos;ll get a Discord message when that happens.
          </p>
        )}
      </aside>
    </div>
  )
}

function RulesReminder() {
  return (
    <details className="group rounded-lg border border-line bg-surface px-4 py-3">
      <summary className="label-caps cursor-pointer list-none text-[14px] text-muted-foreground marker:hidden group-open:text-foreground">
        Before you submit
      </summary>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>The clip shows the whole run and the final time after you exit the trial.</li>
        <li>The timer, your username and the build number are visible.</li>
        <li>No overlays over the footage (handcams and keyboard overlays are fine).</li>
        <li>No autoparkour, autotransition, practice mode or banned glitches.</li>
      </ul>
      <Link href="/rules" className="mt-2 inline-block text-sm underline underline-offset-4">
        Read all the rules
      </Link>
    </details>
  )
}

function RunCard({
  draft,
  index,
  count,
  trials,
  pbs,
  wr,
  issues,
  showAll,
  serverError,
  duplicate,
  perTrial,
  trialScore,
  busy,
  uploadState,
  onChange,
  onFile,
  onFiles,
  onRemove,
}: {
  draft: RunDraft
  index: number
  count: number
  trials: TrialName[]
  pbs: Map<string, number>
  wr?: { time: number; player_name: string }
  issues: Issues
  showAll: boolean
  serverError?: string
  duplicate: boolean
  perTrial?: { before: number; after: number }
  trialScore: (trial: string, time: number) => number
  busy: boolean
  uploadState: { loaded: number; total: number } | "done" | null
  onChange: (change: (draft: RunDraft) => RunDraft) => void
  onFile: (file: File | null) => void
  onFiles: (files: File[]) => void
  onRemove: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const time = parseRunTime(draft.time)
  const pb = draft.trial ? pbs.get(draft.trial) : undefined
  const beatsWr = Boolean(wr && time !== null && time < Number(wr.time))
  const fieldId = (name: string) => `${draft.id}-${name}`
  const trialError = showAll ? issues.trial : undefined
  const showTimeIssue = showAll || (draft.time !== "" && issues.time !== "Enter the time.")
  const timeError = issues.slower ?? (showTimeIssue ? issues.time : undefined)
  const proofError = showAll || draft.link || draft.fileError ? issues.proof : undefined
  const invalid = Boolean(serverError || trialError || timeError || proofError)

  return (
    <section
      id={`run-card-${draft.id}`}
      aria-label={`Run ${index + 1}`}
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-surface p-4 transition-colors",
        invalid ? "border-destructive/50" : "border-line"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-caps text-[16px]">
          Run {index + 1}
          {draft.trial ? <span className="text-muted-foreground"> · {draft.trial}</span> : null}
        </h2>
        {count > 1 ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={busy} aria-label={`Remove run ${index + 1}`}>
            <Trash2Icon />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-caps text-[13px] text-subtle-foreground">Video</span>
        {draft.mode === "file" ? (
          draft.file && draft.previewUrl ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <video
                src={draft.previewUrl}
                controls
                muted
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-md border border-line bg-black object-contain sm:w-64"
                aria-label={`Preview of ${draft.file.name}`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium" title={draft.file.name}>
                  {draft.file.name}
                </span>
                <span className="num text-xs text-muted-foreground">{formatFileSize(draft.file.size)}</span>
                {draft.autoFilled ? (
                  <span className="text-xs text-muted-foreground">Trial and time were read from the file name. Check they&apos;re right.</span>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-2">
                  <label className={cn(busy && "pointer-events-none opacity-50")}>
                    <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-line-strong px-2.5 font-display text-[13px] font-semibold uppercase tracking-[0.06em] hover:border-[#5a5a5a]">
                      Change
                    </span>
                    <input
                      type="file"
                      accept={VIDEO_FILE_ACCEPT}
                      className="sr-only"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onFile(file)
                        event.target.value = ""
                      }}
                    />
                  </label>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onFile(null)}>
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <label
              htmlFor={fieldId("file")}
              onDragOver={(event) => {
                if (busy) return
                event.preventDefault()
                event.stopPropagation()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setDragOver(false)
                const files = Array.from(event.dataTransfer.files ?? [])
                if (files.length && !busy) onFiles(files)
              }}
              className={cn(
                "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : proofError ? "border-destructive/60" : "border-line-strong hover:border-[#5a5a5a]"
              )}
            >
              <UploadIcon className="size-5 text-muted-foreground" aria-hidden />
              <span className="text-sm">
                Drop the video here or <span className="underline underline-offset-4">choose a file</span>
              </span>
              <span className="text-xs text-subtle-foreground">Any video format, up to 500 MB. Pick several to add a run for each.</span>
              <input
                id={fieldId("file")}
                type="file"
                accept={VIDEO_FILE_ACCEPT}
                multiple
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  if (files.length) onFiles(files)
                  event.target.value = ""
                }}
              />
            </label>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId("link")} className="sr-only">
              Medal clip link
            </Label>
            <Input
              id={fieldId("link")}
              type="url"
              inputMode="url"
              placeholder="https://medal.tv/games/roblox/clips/…"
              value={draft.link}
              onChange={(event) => onChange((current) => ({ ...current, link: event.target.value }))}
              aria-invalid={Boolean(proofError)}
              aria-describedby={proofError ? fieldId("proof-error") : undefined}
              disabled={busy}
              className="h-10"
            />
          </div>
        )}
        {proofError ? (
          <p id={fieldId("proof-error")} className="text-[13px] text-destructive">
            {proofError}
          </p>
        ) : null}
        {!draft.file ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange((current) => ({ ...current, mode: current.mode === "file" ? "link" : "file" }))}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {draft.mode === "file" ? (
              <>
                <LinkIcon className="size-3.5" aria-hidden />
                Use a Medal clip link instead
              </>
            ) : (
              <>
                <UploadIcon className="size-3.5" aria-hidden />
                Upload a video file instead
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId("trial")} className="label-caps text-[13px] text-subtle-foreground">
            Trial
          </Label>
          <Select
            value={draft.trial || undefined}
            onValueChange={(value) => onChange((current) => ({ ...current, trial: value as TrialName, autoFilled: false }))}
            disabled={busy}
          >
            <SelectTrigger id={fieldId("trial")} className="h-10 w-full" aria-invalid={Boolean(trialError)}>
              <SelectValue placeholder="Choose a trial" />
            </SelectTrigger>
            <SelectContent>
              {trials.map((trial) => {
                const trialPb = pbs.get(trial)
                return (
                  <SelectItem key={trial} value={trial}>
                    <span className="flex w-full items-baseline justify-between gap-6">
                      {trial}
                      <span className="num text-xs text-muted-foreground">{trialPb !== undefined ? `PB ${formatTime(trialPb)}` : ""}</span>
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          {trialError ? <p className="text-[13px] text-destructive">{trialError}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={fieldId("time")} className="label-caps text-[13px] text-subtle-foreground">
              Time
            </Label>
            <HudzellHelper disabled={busy} onUse={(value) => onChange((current) => ({ ...current, time: value }))} />
          </div>
          <Input
            id={fieldId("time")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.345"
            value={draft.time}
            onChange={(event) => {
              const value = event.target.value
              if (TIME_DRAFT_PATTERN.test(value)) onChange((current) => ({ ...current, time: value, autoFilled: false }))
            }}
            aria-invalid={Boolean(timeError)}
            aria-describedby={timeError ? fieldId("time-error") : undefined}
            disabled={busy}
            className="num h-10 text-[16px]"
          />
        </div>
      </div>
      {timeError ? (
        <p id={fieldId("time-error")} className="-mt-2 text-[13px] text-destructive">
          {timeError}
        </p>
      ) : null}

      {draft.trial && time !== null && !issues.slower ? (
        <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Your PB</dt>
            <dd className="m-0 num">
              {pb !== undefined ? (
                <>
                  {formatTime(pb)} <span className="text-success">{formatDelta(time - pb)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">first run here</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Trial score</dt>
            <dd className="m-0 num">
              {perTrial ? (
                <>
                  {formatScore(perTrial.before)} → <span className="font-semibold">{formatScore(perTrial.after)}</span>
                </>
              ) : (
                formatScore(trialScore(draft.trial, time))
              )}
            </dd>
          </div>
          {wr ? (
            <div className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">WR</dt>
              <dd className={cn("m-0 num", beatsWr && "text-gold")}>
                {formatTime(wr.time)}
                {beatsWr ? <span className="ml-2 font-sans">Faster than the world record!</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {draft.trial && time !== null && pb !== undefined && time === pb ? (
        <p className="text-[13px] text-muted-foreground">That&apos;s the same as your PB, so it won&apos;t change your score.</p>
      ) : null}
      {duplicate ? (
        <p className="text-[13px] text-muted-foreground">Another run in this batch is also {draft.trial}. Only the faster one can count.</p>
      ) : null}
      {serverError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {serverError}
        </p>
      ) : null}
      {uploadState ? (
        uploadState === "done" ? (
          <p className="inline-flex items-center gap-1.5 text-[13px] text-success">
            <CheckIcon className="size-3.5" aria-hidden />
            Uploaded
          </p>
        ) : (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            <div className="flex justify-between text-[13px] text-muted-foreground">
              <span>Uploading</span>
              <span className="num">
                {formatFileSize(uploadState.loaded)} of {formatFileSize(uploadState.total)}
              </span>
            </div>
            <div className="h-1.5 bg-surface-3">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${uploadState.total > 0 ? (uploadState.loaded / uploadState.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )
      ) : null}
    </section>
  )
}

// When a run doesn't beat the in-game PB, the game never shows its final
// time; players read the timer and the "hudzell's great pain" console line
// (F9) and subtract. Rounds the same way the rules FAQ describes.
function HudzellHelper({ disabled, onUse }: { disabled: boolean; onUse: (time: string) => void }) {
  const [open, setOpen] = useState(false)
  const [finish, setFinish] = useState("")
  const [pain, setPain] = useState("")
  const { final } = calculateFinalTime(finish, pain)
  const result = final !== null && final > 0 ? formatThousandths(final) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <CalculatorIcon className="size-3.5" aria-hidden />
        Time not shown?
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3 rounded-lg border border-line-strong bg-surface-2 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          If the run didn&apos;t beat your in-game PB, the final time isn&apos;t shown. Take the timer reading, then subtract the
          value from the &ldquo;hudzell&apos;s great pain&rdquo; line in the console (F9).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hudzell-finish" className="text-xs text-muted-foreground">
              Timer
            </Label>
            <Input
              id="hudzell-finish"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.000"
              value={finish}
              onChange={(event) => {
                if (/^\d*(\.\d{0,9})?$/.test(event.target.value)) setFinish(event.target.value)
              }}
              className="num h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hudzell-pain" className="text-xs text-muted-foreground">
              Hudzell pain
            </Label>
            <Input
              id="hudzell-pain"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.000"
              value={pain}
              onChange={(event) => {
                if (/^-?\d*(\.\d{0,9})?$/.test(event.target.value)) setPain(event.target.value)
              }}
              className="num h-9"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-sm text-muted-foreground">
            Final time <span className="num text-[16px] font-semibold text-foreground">{result ?? "—"}</span>
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!result}
            onClick={() => {
              if (!result) return
              onUse(result)
              setOpen(false)
            }}
          >
            Use this time
          </Button>
        </div>
        <p className="text-xs text-subtle-foreground">The timer rounds down and the pain rounds to the nearest thousandth.</p>
      </PopoverContent>
    </Popover>
  )
}

function SubmitSuccess({ runs, playerUuid, onMore }: { runs: CreatedRun[]; playerUuid: string; onMore: () => void }) {
  return (
    <section aria-labelledby="submitted-title" className="flex max-w-2xl flex-col gap-5 rounded-lg border border-success/40 bg-surface p-6">
      <div className="flex flex-col gap-2">
        <h2 id="submitted-title" className="font-display text-4xl font-extrabold uppercase leading-none">
          Submitted
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {runs.length === 1 ? "Your run is" : `Your ${runs.length} runs are`} waiting for a moderator. Videos are processing now and
          usually play within a minute. You&apos;ll get a Discord message when {runs.length === 1 ? "it's" : "they're"} reviewed.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col border-t border-line p-0">
        {runs.map((run) => (
          <li key={run.uuid} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <span className="text-[15px] font-medium">{run.trial_name}</span>
            <Link href={`/submissions/${encodeURIComponent(run.uuid)}`} className="text-sm underline underline-offset-4">
              View run
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onMore}>
          <PlusIcon />
          Submit more
        </Button>
        <Button asChild variant="outline">
          <Link href={`/submissions/trials?player_uuid=${encodeURIComponent(playerUuid)}`}>Your submissions</Link>
        </Button>
      </div>
    </section>
  )
}
