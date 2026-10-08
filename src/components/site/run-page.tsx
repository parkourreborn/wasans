"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PencilIcon,
  StickyNoteIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { formatCount, formatDateTime, formatScore, formatTime } from "@/lib/format"
import {
  canDeleteRun,
  canModerateKind,
  deleteRun,
  patchRun,
  type ComboRun,
  type ModerationPatch,
  type RunKind,
  type RunResponse,
  type TrialRun,
} from "@/lib/moderation"
import { tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import type { TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { fetchApi, setApiData, useApi } from "@/hooks/use-api"
import { useRunNeighbours } from "@/hooks/use-run-list"
import { useComboCategoryLabel } from "@/hooks/use-combo-categories"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { ConfirmDialog, DenyDialog, EditTimeDialog, NoteDialog } from "@/components/site/moderation-dialogs"
import { RobloxAccounts } from "@/components/site/roblox-accounts"
import { RunVideo } from "@/components/site/run-video"
import { normalizeRunState, StatusBadge, WrBadge, type RunState } from "@/components/site/status-badge"
import { TierLabel } from "@/components/site/tier-label"
import type { WorldRecordsResponse } from "@/components/site/trials-index"
import { YoutubeEmbed } from "@/components/site/youtube-embed"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// While the server is still processing a run's video, check back this often.
const VIDEO_POLL_MS = 5000

type PlayerPb = { trial_name: string; time: number; submission_uuid: string; date: number }
type ComboPb = { category_slug: string; combo_count: number; submission_uuid: string; date: number }
type PlayerDetailResponse = { data?: { player?: { score?: number; pbs?: PlayerPb[]; combo_pbs?: ComboPb[] } | null } }

function trialRunUrl(uuid: string) {
  return apiV2(`/submissions/${encodeURIComponent(uuid)}`)
}

function comboRunUrl(uuid: string) {
  return apiV2(`/combo-submissions/${encodeURIComponent(uuid)}`)
}

// /submissions/[uuid]: a trial run or a combo, whichever the id belongs to.
export function RunPage({ uuid }: { uuid: string }) {
  const trial = useApi<RunResponse<TrialRun>>(trialRunUrl(uuid))
  const combo = useApi<RunResponse<ComboRun>>(comboRunUrl(uuid))
  const trialRun = trial.data?.data?.results?.[0]
  const comboRun = combo.data?.data?.results?.[0]

  if (trialRun) {
    return <TrialRunView run={trialRun} />
  }
  if (comboRun) {
    return <ComboRunView run={comboRun} />
  }
  if (trial.loading || combo.loading) {
    return <RunSkeleton />
  }
  if (trial.error && combo.error) {
    return (
      <RunMessage title="Couldn't load this run">
        {trial.error}{" "}
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => {
            trial.refetch()
            combo.refetch()
          }}
        >
          Try again
        </button>
      </RunMessage>
    )
  }
  return (
    <RunMessage title="Run not found">
      It may have been deleted. <Link href="/submissions/trials" className="underline underline-offset-4">Browse submissions</Link>
    </RunMessage>
  )
}

function RunMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-24">
      <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.9]">{title}</h1>
      <p className="text-[15px] text-muted-foreground">{children}</p>
    </div>
  )
}

function RunSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-5" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-3 border-b border-line pb-6">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full max-w-lg" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  )
}

// Back link, previous/next through the list the run was opened from.
function RunNav({ uuid, kind }: { uuid: string; kind: RunKind }) {
  const searchParams = useSearchParams()
  const fromReview = searchParams.get("from") === "review"
  const { previous, next } = useRunNeighbours(uuid)
  const back = fromReview
    ? { href: "/review", label: "Review queue" }
    : kind === "trial"
      ? { href: "/submissions/trials", label: "Submissions" }
      : { href: "/submissions/combos", label: "Combo submissions" }
  const step = (target: string | null, label: string, Icon: typeof ChevronLeftIcon) =>
    target ? (
      <Button asChild variant="outline" size="icon" aria-label={label}>
        <Link href={`/submissions/${encodeURIComponent(target)}${fromReview ? "?from=review" : ""}`}>
          <Icon />
        </Link>
      </Button>
    ) : (
      <Button type="button" variant="outline" size="icon" aria-label={label} disabled>
        <Icon />
      </Button>
    )

  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <Link
        href={back.href}
        className="label-caps inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {back.label}
      </Link>
      {previous || next ? (
        <div className="flex gap-2">
          {step(previous, "Previous run", ChevronLeftIcon)}
          {step(next, "Next run", ChevronRightIcon)}
        </div>
      ) : null}
    </div>
  )
}

function PlayerLine({
  run,
  score,
  children,
}: {
  run: TrialRun | ComboRun
  score?: number | null
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <Link
        href={`/players/${encodeURIComponent(run.player_uuid)}`}
        className="inline-flex items-center gap-2 text-[15px] font-medium text-foreground hover:underline hover:underline-offset-4"
      >
        <PlayerAvatar
          playerName={run.player_name}
          playerUuid={run.player_uuid}
          hasRobloxAvatar={run.has_roblox_avatar}
          discordId={run.discord_id}
          discordAvatar={run.discord_avatar}
          discordDiscriminator={run.discord_discriminator}
          size="sm"
          className="rounded-md"
        />
        {run.player_name}
      </Link>
      {score != null ? <TierLabel tier={tierForScore(Number(score))} className="text-[14px]" /> : null}
      <span>Submitted {formatDateTime(run.date)}</span>
      {children}
    </div>
  )
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-lg border border-line bg-surface p-4", className)}>
      <h2 className="label-caps text-[14px] text-subtle-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 text-sm">{children}</dd>
    </div>
  )
}

// How far a time is from another: "0.217 faster" or "1.472 behind".
function Gap({ seconds, highlight = false }: { seconds: number; highlight?: boolean }) {
  if (!Number.isFinite(seconds) || Math.abs(seconds) < 0.0005) {
    return <span className="text-[13px] text-muted-foreground">tied</span>
  }
  return (
    <span className={cn("text-[13px]", highlight ? "text-gold" : "text-muted-foreground")}>
      <span className="num">{Math.abs(seconds).toFixed(3)}</span> {seconds < 0 ? "faster" : "behind"}
    </span>
  )
}

function NoteBlock({ note, by }: { note?: string | null; by?: string | null }) {
  const text = note?.trim()
  if (!text) return null
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <figcaption className="label-caps text-[13px] text-subtle-foreground">Moderator note</figcaption>
      <blockquote className="m-0 text-[15px] leading-relaxed">{text}</blockquote>
      {by ? <span className="text-[13px] text-muted-foreground">{by}</span> : null}
    </figure>
  )
}

type Dialog = "deny" | "note" | "time" | "delete" | null

// What a moderator can do to a run, plus delete for whoever may.
function ModerationPanel({
  kind,
  run,
  state,
  approveBlockedReason,
  canModerate,
  canDelete,
  busy,
  onSetState,
  onOpen,
  extraActions,
}: {
  kind: RunKind
  run: TrialRun | ComboRun
  state: RunState
  approveBlockedReason: string | null
  canModerate: boolean
  canDelete: boolean
  busy: boolean
  onSetState: (state: RunState) => void
  onOpen: (dialog: Exclude<Dialog, null>) => void
  extraActions?: React.ReactNode
}) {
  if (!canModerate && !canDelete) return null

  const stateButton = (value: RunState, label: string, Icon: typeof CheckIcon, tone: string) => {
    const current = state === value
    const blocked = value === "approved" && !current && Boolean(approveBlockedReason)
    return (
      <button
        type="button"
        aria-pressed={current}
        disabled={busy || blocked}
        title={blocked ? (approveBlockedReason ?? undefined) : undefined}
        onClick={() => (value === "denied" ? onOpen("deny") : onSetState(value))}
        className={cn(
          "label-caps flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          current ? tone : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <Panel title={canModerate ? "Moderation" : "Your run"}>
      {canModerate ? (
        <>
          <div role="group" aria-label="Run status" className="flex gap-1.5">
            {stateButton("pending", "Pending", ClockIcon, "border-foreground bg-foreground text-background")}
            {stateButton("approved", "Approve", CheckIcon, "border-success bg-success text-background")}
            {stateButton("denied", "Deny", XIcon, "border-destructive bg-destructive text-background")}
          </div>
          {approveBlockedReason && state !== "approved" ? (
            <p className="text-[13px] text-muted-foreground">{approveBlockedReason}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpen("note")}>
              <StickyNoteIcon />
              {run.moderator_note ? "Edit note" : "Add note"}
            </Button>
            {extraActions}
          </div>
          <RobloxAccounts playerUuid={run.player_uuid} className="border-t border-line pt-3" />
        </>
      ) : null}
      {canDelete ? (
        <div className={cn("flex flex-wrap items-center justify-between gap-3", canModerate && "border-t border-line pt-3")}>
          <p className="text-[13px] text-muted-foreground">
            {canModerate ? "Removes the run and its video for good." : "Withdraw this run. It can't be undone."}
          </p>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => onOpen("delete")}>
            <Trash2Icon />
            Delete {kind === "trial" ? "run" : "combo"}
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}

// The moderation state machine both views share: dialogs, the in-flight
// flag, and writing a change back into the cached run.
function useRunModeration<T extends TrialRun | ComboRun>(kind: RunKind, run: T) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const url = kind === "trial" ? trialRunUrl(run.uuid) : comboRunUrl(run.uuid)

  const save = async (patch: ModerationPatch, done: string) => {
    setBusy(true)
    try {
      const updated = await patchRun<T>(kind, run.uuid, patch)
      if (updated) setApiData(url, { data: { results: [updated] } })
      setDialog(null)
      toast.success(done)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that change")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteRun(kind, run.uuid)
      setApiData(url, { data: { results: [] } })
      toast.success(kind === "trial" ? "Run deleted" : "Combo deleted")
      router.replace(kind === "trial" ? "/submissions/trials" : "/submissions/combos")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the run")
      setBusy(false)
    }
  }

  return { dialog, setDialog, busy, save, remove }
}

function TrialRunView({ run }: { run: TrialRun }) {
  const { user } = useAuthSession()
  const permission = user?.permission ?? 0
  const state = normalizeRunState(run.state)
  const time = Number(run.time)
  const trialName = run.trial_name as TrialName
  const { data: wrData } = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const { data: playerData } = useApi<PlayerDetailResponse>(apiV2(`/players/${encodeURIComponent(run.player_uuid)}?include=pbs`))
  const wr = wrData?.data?.find((record) => record.trial_name === run.trial_name)
  const pb = playerData?.data?.player?.pbs?.find((entry) => entry.trial_name === run.trial_name)
  const playerScore = playerData?.data?.player?.score ?? run.player_score
  const isWr = wr?.submission_uuid === run.uuid
  const isPb = pb?.submission_uuid === run.uuid
  const beatsWr = Boolean(wr && !isWr && time < Number(wr.time))
  const trialScore = wr ? calculateScore(Number(wr.time), time, trialName) : null
  const canModerate = canModerateKind("trial", permission)
  const canDelete = Boolean(user) && canDeleteRun("trial", permission, user?.uuid === run.player_uuid)
  const moderation = useRunModeration("trial", run)
  const runLabel = `${run.trial_name} ${formatTime(time)} by ${run.player_name}`
  const videoStatus = run.video_status ?? "ready"
  const approveBlockedReason =
    videoStatus === "processing"
      ? "The video is still processing. Approve once it plays."
      : videoStatus === "failed"
        ? "The video failed to process, so this run can't be approved."
        : null

  // Check back until the server finishes the video.
  useEffect(() => {
    if (videoStatus !== "processing") return
    const timer = window.setInterval(() => void fetchApi(trialRunUrl(run.uuid), { force: true }), VIDEO_POLL_MS)
    return () => window.clearInterval(timer)
  }, [videoStatus, run.uuid])

  const medal = run.video_source_type === "medal" && run.video_source_ref ? run.video_source_ref : null

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16">
      <RunNav uuid={run.uuid} kind="trial" />
      <header className="flex flex-col gap-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={state} />
          {isWr ? <WrBadge /> : null}
          {isPb && !isWr ? (
            <span className="label-caps inline-flex h-6 items-center border border-[#5a5a5a] px-2 text-[13px]">PB</span>
          ) : null}
        </div>
        <h1 className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Link
            href={trialHref(run.trial_name)}
            className="font-display text-[52px] font-extrabold uppercase leading-[0.9] hover:underline hover:decoration-2 hover:underline-offset-8 md:text-[80px]"
          >
            {run.trial_name}
          </Link>
          <span className="num text-[40px] font-semibold leading-none md:text-[60px]">{formatTime(time)}</span>
        </h1>
        <PlayerLine run={run} score={playerScore} />
      </header>

      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <RunVideo
            key={run.uuid}
            submissionUuid={run.uuid}
            status={videoStatus}
            errorMessage={run.video_error}
            label={`${runLabel}, run video`}
            fallback={
              medal ? (
                <a href={medal} target="_blank" rel="noreferrer noopener" className="text-sm underline underline-offset-4">
                  Open the Medal clip
                </a>
              ) : null
            }
          />
          {videoStatus === "failed" && user?.uuid === run.player_uuid ? (
            <p className="text-sm text-muted-foreground">Delete this run and submit it again with the video.</p>
          ) : null}
          <NoteBlock note={run.moderator_note} by={run.moderator_username ? `${run.moderator_username}` : null} />
        </div>

        <aside className="flex flex-col gap-4">
          <Panel title="Run">
            <dl className="m-0 flex flex-col gap-2.5">
              <Fact label="Trial score">
                <span className="num text-[15px] font-semibold">{trialScore === null ? "—" : formatScore(trialScore)}</span>
              </Fact>
              <Fact label="World record">
                {wr ? (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num">{formatTime(wr.time)}</span>
                    {isWr ? (
                      <span className="text-[13px] text-gold">This run</span>
                    ) : (
                      <>
                        <span className="text-[13px] text-muted-foreground">by {wr.player_name}</span>
                        <Gap seconds={time - Number(wr.time)} highlight={beatsWr} />
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None yet</span>
                )}
              </Fact>
              <Fact label={user?.uuid === run.player_uuid ? "Your PB" : "Their PB"}>
                {pb ? (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num">{formatTime(pb.time)}</span>
                    {isPb ? (
                      <span className="text-[13px] text-muted-foreground">This run</span>
                    ) : (
                      <Gap seconds={time - Number(pb.time)} />
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No approved run yet</span>
                )}
              </Fact>
              <Fact label="Proof">
                {medal ? (
                  <a href={medal} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 hover:underline hover:underline-offset-4">
                    Medal clip <ExternalLinkIcon className="size-3.5 text-subtle-foreground" aria-hidden />
                  </a>
                ) : (
                  "Uploaded video"
                )}
              </Fact>
              {run.moderator_username ? <Fact label="Moderated by">{run.moderator_username}</Fact> : null}
            </dl>
          </Panel>

          <ModerationPanel
            kind="trial"
            run={run}
            state={state}
            approveBlockedReason={approveBlockedReason}
            canModerate={canModerate}
            canDelete={canDelete}
            busy={moderation.busy}
            onSetState={(next) => void moderation.save({ state: next }, next === "approved" ? "Run approved" : "Run moved back to pending")}
            onOpen={moderation.setDialog}
            extraActions={
              <>
                <Button type="button" variant="outline" size="sm" disabled={moderation.busy} onClick={() => moderation.setDialog("time")}>
                  <PencilIcon />
                  Edit time
                </Button>
                {run.original_key ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={apiV2(`/submissions/${encodeURIComponent(run.uuid)}/original`)} title="The file exactly as submitted, kept for 90 days">
                      <DownloadIcon />
                      Original file
                    </a>
                  </Button>
                ) : null}
              </>
            }
          />
        </aside>
      </div>

      <DenyDialog
        open={moderation.dialog === "deny"}
        onOpenChange={(open) => moderation.setDialog(open ? "deny" : null)}
        kind="trial"
        runLabel={runLabel}
        initialNote={run.moderator_note}
        busy={moderation.busy}
        onConfirm={(note) => void moderation.save({ state: "denied", moderator_note: note }, "Run denied")}
      />
      <NoteDialog
        open={moderation.dialog === "note"}
        onOpenChange={(open) => moderation.setDialog(open ? "note" : null)}
        runLabel={runLabel}
        initialNote={run.moderator_note}
        busy={moderation.busy}
        onConfirm={(note) => void moderation.save({ moderator_note: note }, "Note saved")}
      />
      <EditTimeDialog
        open={moderation.dialog === "time"}
        onOpenChange={(open) => moderation.setDialog(open ? "time" : null)}
        runLabel={runLabel}
        currentTime={time}
        trialName={run.trial_name}
        wrTime={wr ? Number(wr.time) : null}
        busy={moderation.busy}
        onConfirm={(next) => void moderation.save({ time: next }, "Time updated")}
      />
      <ConfirmDialog
        open={moderation.dialog === "delete"}
        onOpenChange={(open) => moderation.setDialog(open ? "delete" : null)}
        title="Delete run?"
        description={`${runLabel} and its video will be removed. ${
          isPb && state === "approved" ? "It's the current PB on this trial, so the score drops back to the next best run. " : ""
        }This can't be undone.`}
        confirmLabel="Delete"
        busy={moderation.busy}
        onConfirm={() => void moderation.remove()}
      />
    </div>
  )
}

function ComboRunView({ run }: { run: ComboRun }) {
  const { user } = useAuthSession()
  const permission = user?.permission ?? 0
  const state = normalizeRunState(run.state)
  const categoryLabel = useComboCategoryLabel(run.category_slug)
  const { data: playerData } = useApi<PlayerDetailResponse>(apiV2(`/players/${encodeURIComponent(run.player_uuid)}?include=combo_pbs`))
  const best = playerData?.data?.player?.combo_pbs?.find((entry) => entry.category_slug === run.category_slug)
  const isBest = best?.submission_uuid === run.uuid
  const canModerate = canModerateKind("combo", permission)
  const canDelete = Boolean(user) && canDeleteRun("combo", permission, user?.uuid === run.player_uuid)
  const moderation = useRunModeration("combo", run)
  const runLabel = `${categoryLabel} ${formatCount(run.combo_count)} by ${run.player_name}`

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16">
      <RunNav uuid={run.uuid} kind="combo" />
      <header className="flex flex-col gap-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge state={state} />
          {isBest ? <span className="label-caps inline-flex h-6 items-center border border-[#5a5a5a] px-2 text-[13px]">Best</span> : null}
        </div>
        <h1 className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="font-display text-[52px] font-extrabold uppercase leading-[0.9] md:text-[80px]">{categoryLabel}</span>
          <span className="num text-[40px] font-semibold leading-none md:text-[60px]">{formatCount(run.combo_count)}</span>
        </h1>
        <PlayerLine run={run} />
      </header>

      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <YoutubeEmbed url={run.youtube_url} title={`${runLabel}, combo video`} />
          <NoteBlock note={run.moderator_note} by={run.moderator_username} />
        </div>

        <aside className="flex flex-col gap-4">
          <Panel title="Combo">
            <dl className="m-0 flex flex-col gap-2.5">
              <Fact label="Category">{categoryLabel}</Fact>
              <Fact label="Combo">
                <span className="num text-[15px] font-semibold">{formatCount(run.combo_count)}</span>
              </Fact>
              <Fact label="Their best">
                {best ? (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num">{formatCount(best.combo_count)}</span>
                    {isBest ? <span className="text-[13px] text-muted-foreground">This combo</span> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No approved combo yet</span>
                )}
              </Fact>
              <Fact label="Proof">
                <a
                  href={run.youtube_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 hover:underline hover:underline-offset-4"
                >
                  YouTube <ExternalLinkIcon className="size-3.5 text-subtle-foreground" aria-hidden />
                </a>
              </Fact>
              {run.moderator_username ? <Fact label="Moderated by">{run.moderator_username}</Fact> : null}
            </dl>
          </Panel>

          <ModerationPanel
            kind="combo"
            run={run}
            state={state}
            approveBlockedReason={null}
            canModerate={canModerate}
            canDelete={canDelete}
            busy={moderation.busy}
            onSetState={(next) => void moderation.save({ state: next }, next === "approved" ? "Combo approved" : "Combo moved back to pending")}
            onOpen={moderation.setDialog}
          />
        </aside>
      </div>

      <DenyDialog
        open={moderation.dialog === "deny"}
        onOpenChange={(open) => moderation.setDialog(open ? "deny" : null)}
        kind="combo"
        runLabel={runLabel}
        initialNote={run.moderator_note}
        busy={moderation.busy}
        onConfirm={(note) => void moderation.save({ state: "denied", moderator_note: note }, "Combo denied")}
      />
      <NoteDialog
        open={moderation.dialog === "note"}
        onOpenChange={(open) => moderation.setDialog(open ? "note" : null)}
        runLabel={runLabel}
        initialNote={run.moderator_note}
        busy={moderation.busy}
        onConfirm={(note) => void moderation.save({ moderator_note: note }, "Note saved")}
      />
      <ConfirmDialog
        open={moderation.dialog === "delete"}
        onOpenChange={(open) => moderation.setDialog(open ? "delete" : null)}
        title="Delete combo?"
        description={`${runLabel} will be removed. This can't be undone.`}
        confirmLabel="Delete"
        busy={moderation.busy}
        onConfirm={() => void moderation.remove()}
      />
    </div>
  )
}
