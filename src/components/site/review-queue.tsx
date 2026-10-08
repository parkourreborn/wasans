"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon, PencilIcon, RefreshCwIcon, StickyNoteIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { formatCount, formatDateTime, formatDelta, formatScore, formatTime, formatWaiting } from "@/lib/format"
import {
  canModerateKind,
  patchRun,
  rememberRunList,
  type ComboRun,
  type ModerationPatch,
  type RunKind,
  type RunListResponse,
  type TrialRun,
} from "@/lib/moderation"
import { estimateScore } from "@/lib/score-estimate"
import { tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import type { TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { fetchApi, setApiData, useApi, type ApiState } from "@/hooks/use-api"
import { useComboCategoryLabel } from "@/hooks/use-combo-categories"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useLoginDialog } from "@/components/site/login-dialog"
import { DenyDialog, EditTimeDialog, NoteDialog } from "@/components/site/moderation-dialogs"
import { RobloxAccounts } from "@/components/site/roblox-accounts"
import { RunVideo } from "@/components/site/run-video"
import { TierLabel } from "@/components/site/tier-label"
import type { WorldRecord, WorldRecordsResponse } from "@/components/site/trials-index"
import { YoutubeEmbed } from "@/components/site/youtube-embed"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// The oldest 100 waiting runs; the API caps a page there.
const QUEUE_LIMIT = 100
// How long a decision waits before it's sent, so Undo never has to send
// the player a second message.
const UNDO_MS = 5000
const REFRESH_MS = 60_000

type QueueItem = TrialRun | ComboRun
type PlayerPb = { trial_name: string; time: number; submission_uuid: string }
type ComboPb = { category_slug: string; combo_count: number; submission_uuid: string }
type PlayerDetail = { score?: number; rank?: number; pbs?: PlayerPb[]; combo_pbs?: ComboPb[] }
type PlayerDetailResponse = { data?: { player?: PlayerDetail | null } }

export function queueUrl(kind: RunKind) {
  return apiV2(`/${kind === "trial" ? "submissions" : "combo-submissions"}?state=pending&order=asc&limit=${QUEUE_LIMIT}`)
}

function playerUrl(kind: RunKind, uuid: string) {
  return apiV2(`/players/${encodeURIComponent(uuid)}?include=${kind === "trial" ? "pbs" : "combo_pbs"}`)
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || Boolean(target.closest("[role=dialog]")))
  )
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

// /review: everything waiting for a moderator, oldest first.
export function ReviewQueue() {
  const { status, user } = useAuthSession()
  const { openLogin } = useLoginDialog()
  const searchParams = useSearchParams()
  const permission = user?.permission ?? 0
  const allowTrials = canModerateKind("trial", permission)
  const allowCombos = canModerateKind("combo", permission)
  const kind: RunKind = searchParams.get("type") === "combo" || !allowTrials ? "combo" : "trial"
  const trialList = useApi<RunListResponse<TrialRun>>(allowTrials ? queueUrl("trial") : null)
  const comboList = useApi<RunListResponse<ComboRun>>(allowCombos ? queueUrl("combo") : null)

  if (!user && status === "loading") {
    return <ReviewQueueSkeleton />
  }

  if (!user && status === "unknown") {
    return (
      <QueueMessage title="Review">
        Couldn&apos;t check whether you&apos;re logged in.{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => window.location.reload()}>
          Try again
        </button>
      </QueueMessage>
    )
  }

  if (!user) {
    return (
      <QueueMessage title="Review">
        The review queue is for moderators.{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => openLogin("Log in to review runs.")}>
          Log in
        </button>
      </QueueMessage>
    )
  }

  if (!allowCombos) {
    return (
      <QueueMessage title="Review">
        Only moderators can review runs. <Link href="/submissions/trials" className="underline underline-offset-4">Browse submissions</Link>
      </QueueMessage>
    )
  }

  const tabs = [
    allowTrials ? { kind: "trial" as const, label: "Trials", href: "/review", count: trialList.data?.meta?.count } : null,
    { kind: "combo" as const, label: "Combos", href: "/review?type=combo", count: comboList.data?.meta?.count },
  ].filter((tab) => tab !== null)

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col px-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line pb-5 pt-8">
        <h1 className="font-display text-[52px] font-extrabold uppercase leading-[0.9] md:text-[72px]">Review</h1>
        {tabs.length > 1 ? (
          <nav aria-label="Queues" className="flex gap-1">
            {tabs.map((tab) => (
              <Link
                key={tab.kind}
                href={tab.href}
                replace
                scroll={false}
                aria-current={tab.kind === kind ? "page" : undefined}
                className={cn(
                  "label-caps flex h-10 items-center gap-2 rounded-md border px-4 text-[15px] transition-colors",
                  tab.kind === kind
                    ? "border-foreground bg-foreground text-background"
                    : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn("num text-[13px] tracking-normal", tab.kind === kind ? "text-background/70" : "text-subtle-foreground")}>
                  {tab.count ?? "…"}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <QueueView key={kind} kind={kind} list={kind === "trial" ? trialList : comboList} />
    </div>
  )
}

function QueueMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-24">
      <h1 className="font-display text-[52px] font-extrabold uppercase leading-[0.9] md:text-[72px]">{title}</h1>
      <p className="text-[15px] text-muted-foreground">{children}</p>
    </div>
  )
}

export function ReviewQueueSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pt-8" aria-busy="true">
      <Skeleton className="h-16 w-64" />
      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="aspect-video w-full" />
      </div>
    </div>
  )
}

type Staged = {
  kind: RunKind
  uuid: string
  patch: ModerationPatch
  label: string
  timer: number
  undo: () => void
}

// Holds the latest decision for UNDO_MS before sending it. A newer decision,
// leaving the page or hiding the tab sends it straight away.
function useStagedDecisions(onFailed: (uuid: string) => void) {
  const staged = useRef<Staged | null>(null)

  const send = useCallback(
    (item: Staged, keepalive = false) => {
      window.clearTimeout(item.timer)
      if (staged.current === item) staged.current = null
      patchRun(item.kind, item.uuid, item.patch, { keepalive }).catch((error: unknown) => {
        onFailed(item.uuid)
        toast.error(`${item.label} wasn't saved`, {
          description: error instanceof Error ? error.message : undefined,
        })
      })
    },
    [onFailed]
  )

  const stage = useCallback(
    (next: Omit<Staged, "timer">) => {
      if (staged.current) send(staged.current)
      const item: Staged = { ...next, timer: 0 }
      item.timer = window.setTimeout(() => send(item), UNDO_MS)
      staged.current = item
      toast(next.label, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            if (staged.current !== item) return
            window.clearTimeout(item.timer)
            staged.current = null
            item.undo()
          },
        },
      })
    },
    [send]
  )

  const undoLatest = useCallback(() => {
    const item = staged.current
    if (!item) return false
    window.clearTimeout(item.timer)
    staged.current = null
    toast.dismiss()
    item.undo()
    return true
  }, [])

  useEffect(() => {
    const flush = () => {
      if (staged.current) send(staged.current, true)
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
      flush()
    }
  }, [send])

  return { stage, undoLatest }
}

type DialogName = "deny" | "note" | "time" | null

function QueueView({ kind, list }: { kind: RunKind; list: ApiState<RunListResponse<QueueItem>> }) {
  const now = useMinuteClock()
  const url = queueUrl(kind)
  const items = list.data?.data ?? []
  const total = list.data?.meta?.count ?? items.length
  const [hidden, setHidden] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogName>(null)
  const [busy, setBusy] = useState(false)
  const visible = items.filter((item) => !hidden.includes(item.uuid))
  const currentIndex = Math.max(
    0,
    visible.findIndex((item) => item.uuid === selected)
  )
  const current = visible[currentIndex] ?? null
  const { data: wrData } = useApi<WorldRecordsResponse>(kind === "trial" ? apiV2("/records/world") : null)

  // Warm the next run's player context so moving on is instant.
  const upNext = visible[currentIndex + 1]
  useEffect(() => {
    if (upNext) void fetchApi(playerUrl(kind, upNext.player_uuid))
  }, [kind, upNext])

  useEffect(() => {
    const timer = window.setInterval(() => void fetchApi(url, { force: true }), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [url])

  const restore = useCallback((uuid: string) => {
    setHidden((current) => current.filter((item) => item !== uuid))
    setSelected(uuid)
  }, [])
  const { stage, undoLatest } = useStagedDecisions(restore)

  const label = (item: QueueItem) =>
    "trial_name" in item ? `${item.trial_name} ${formatTime(item.time)} by ${item.player_name}` : `Combo ${formatCount(item.combo_count)} by ${item.player_name}`

  const move = (step: number) => {
    const target = visible[currentIndex + step]
    if (target) setSelected(target.uuid)
  }

  const decide = (patch: ModerationPatch, verb: string) => {
    if (!current) return
    const item = current
    const following = visible[currentIndex + 1] ?? visible[currentIndex - 1] ?? null
    setHidden((previous) => [...previous, item.uuid])
    setSelected(following?.uuid ?? null)
    setDialog(null)
    stage({ kind, uuid: item.uuid, patch, label: `${verb} ${label(item)}`, undo: () => restore(item.uuid) })
  }

  // Notes and time edits stay on the run, so they're sent right away.
  const saveNow = async (patch: ModerationPatch, done: string) => {
    if (!current) return
    setBusy(true)
    try {
      const updated = await patchRun<QueueItem>(kind, current.uuid, patch)
      if (updated && list.data) {
        setApiData(url, { ...list.data, data: items.map((item) => (item.uuid === updated.uuid ? { ...item, ...updated } : item)) })
      }
      setDialog(null)
      toast.success(done)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that change")
    } finally {
      setBusy(false)
    }
  }

  const videoReady = !current || !("trial_name" in current) || (current.video_status ?? "ready") === "ready"

  // Keys work whenever focus isn't in a field or a dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      const key = event.key.toLowerCase()
      if (key === "z") {
        if (undoLatest()) event.preventDefault()
        return
      }
      if (!current) return
      if (key === "a" && videoReady) decide({ state: "approved" }, "Approved")
      else if (key === "d") setDialog("deny")
      else if (key === "n") setDialog("note")
      else if (key === "e" && kind === "trial") setDialog("time")
      else if (key === "j") move(1)
      else if (key === "k") move(-1)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (list.loading) {
    return (
      <div className="grid gap-6 pt-6 lg:grid-cols-[19rem_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="aspect-video w-full" />
      </div>
    )
  }

  if (list.error && !list.data) {
    return (
      <div className="flex flex-col items-start gap-3 py-16">
        <p className="text-[15px] text-muted-foreground">{list.error}</p>
        <Button type="button" variant="outline" onClick={list.refetch}>
          Try again
        </Button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="flex flex-col items-start gap-4 py-20">
        <p className="font-display text-4xl font-extrabold uppercase leading-none">All clear</p>
        <p className="text-[15px] text-muted-foreground">
          No {kind === "trial" ? "trial runs" : "combos"} are waiting. New ones show up here on their own.
        </p>
        <Button type="button" variant="outline" onClick={list.refetch} disabled={list.validating}>
          <RefreshCwIcon className={cn(list.validating && "animate-spin")} />
          Check now
        </Button>
      </div>
    )
  }

  const runHref = `/submissions/${encodeURIComponent(current.uuid)}?from=review`
  const wr = "trial_name" in current ? wrData?.data?.find((record) => record.trial_name === current.trial_name) : undefined

  return (
    <div className="grid gap-6 pt-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section aria-label="Waiting" className="order-2 flex min-w-0 flex-col lg:order-1">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
          <span className="label-caps text-[14px] text-subtle-foreground">
            {visible.length} waiting{total > items.length ? `, oldest ${items.length} shown` : ""}
          </span>
          <button
            type="button"
            onClick={list.refetch}
            disabled={list.validating}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <RefreshCwIcon className={cn("size-3.5", list.validating && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
        <ol className="flex max-h-[70vh] flex-col overflow-y-auto">
          {visible.map((item) => {
            const isCurrent = item.uuid === current.uuid
            return (
              <li key={item.uuid}>
                <QueueRow item={item} now={now} current={isCurrent} onSelect={() => setSelected(item.uuid)} />
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-label="Run under review" className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
        {"trial_name" in current ? (
          <TrialReview run={current} wr={wr} records={wrData?.data ?? []} now={now} />
        ) : (
          <ComboReview run={current} now={now} />
        )}

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-2 border-y border-line bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 lg:bottom-4 lg:mx-0 lg:rounded-lg lg:border lg:border-line-strong lg:bg-surface-2/95 lg:px-3 lg:shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
          <Button
            type="button"
            size="lg"
            disabled={!videoReady}
            title={videoReady ? undefined : "The video has to finish processing first"}
            onClick={() => decide({ state: "approved" }, "Approved")}
            className="bg-success text-background hover:bg-success/85"
          >
            <CheckIcon />
            Approve
            <KeyHint>A</KeyHint>
          </Button>
          <Button type="button" size="lg" onClick={() => setDialog("deny")} className="bg-destructive text-background hover:bg-destructive/85">
            <XIcon />
            Deny
            <KeyHint>D</KeyHint>
          </Button>
          {kind === "trial" ? (
            <Button type="button" variant="outline" size="lg" onClick={() => setDialog("time")}>
              <PencilIcon />
              <span className="hidden sm:inline">Edit time</span>
              <KeyHint>E</KeyHint>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="lg" onClick={() => setDialog("note")}>
            <StickyNoteIcon />
            <span className="hidden sm:inline">Note</span>
            <KeyHint>N</KeyHint>
          </Button>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <Link
              href={runHref}
              onClick={() => rememberRunList(visible.map((item) => item.uuid))}
              className="hidden items-center gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Run page <ExternalLinkIcon className="size-3.5" aria-hidden />
            </Link>
            <Button type="button" variant="outline" size="icon-lg" aria-label="Previous run (K)" disabled={currentIndex === 0} onClick={() => move(-1)}>
              <ChevronUpIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Next run (J)"
              disabled={currentIndex >= visible.length - 1}
              onClick={() => move(1)}
            >
              <ChevronDownIcon />
            </Button>
          </div>
        </div>
        {!videoReady ? (
          <p className="text-[13px] text-muted-foreground">
            {"trial_name" in current && current.video_status === "failed"
              ? "The video failed to process, so this run can only be denied."
              : "The video is still processing. You can approve it once it plays."}
          </p>
        ) : null}
        <p className="hidden text-[13px] text-subtle-foreground lg:block">
          Keys: <KeyHint inline>A</KeyHint> approve, <KeyHint inline>D</KeyHint> deny
          {kind === "trial" ? (
            <>
              , <KeyHint inline>E</KeyHint> edit time
            </>
          ) : null}
          , <KeyHint inline>N</KeyHint> note, <KeyHint inline>J</KeyHint> <KeyHint inline>K</KeyHint> next and previous,{" "}
          <KeyHint inline>Z</KeyHint> undo. Decisions send after {UNDO_MS / 1000} seconds.
        </p>
      </section>

      <DenyDialog
        open={dialog === "deny"}
        onOpenChange={(open) => setDialog(open ? "deny" : null)}
        kind={kind}
        runLabel={label(current)}
        initialNote={current.moderator_note}
        onConfirm={(note) => decide({ state: "denied", moderator_note: note }, "Denied")}
      />
      <NoteDialog
        open={dialog === "note"}
        onOpenChange={(open) => setDialog(open ? "note" : null)}
        runLabel={label(current)}
        initialNote={current.moderator_note}
        busy={busy}
        onConfirm={(note) => void saveNow({ moderator_note: note }, "Note saved")}
      />
      {"trial_name" in current ? (
        <EditTimeDialog
          open={dialog === "time"}
          onOpenChange={(open) => setDialog(open ? "time" : null)}
          runLabel={label(current)}
          currentTime={Number(current.time)}
          trialName={current.trial_name}
          wrTime={wr ? Number(wr.time) : null}
          busy={busy}
          onConfirm={(time) => void saveNow({ time }, "Time updated")}
        />
      ) : null}
    </div>
  )
}

function KeyHint({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <span
      aria-hidden={!inline}
      className={cn(
        "num rounded-sm border border-current/30 px-1 text-[11px] leading-4 tracking-normal",
        inline ? "inline-block text-muted-foreground" : "ml-0.5 hidden opacity-70 md:inline-block"
      )}
    >
      {children}
    </span>
  )
}

function QueueRow({ item, now, current, onSelect }: { item: QueueItem; now: number; current: boolean; onSelect: () => void }) {
  const title = "trial_name" in item ? item.trial_name : <ComboTitle slug={item.category_slug} />
  const value = "trial_name" in item ? formatTime(item.time) : formatCount(item.combo_count)
  const processing = "trial_name" in item && item.video_status === "processing"

  return (
    <button
      type="button"
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
        current && "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]"
      )}
    >
      <span className="truncate text-[15px] font-medium">{title}</span>
      <span className="num text-[15px] font-semibold">{value}</span>
      <span className="truncate text-[13px] text-muted-foreground">
        {item.player_name}
        {processing ? <span className="text-subtle-foreground"> · processing</span> : null}
      </span>
      <span className="num text-right text-[12px] text-subtle-foreground" title={formatDateTime(item.date)}>
        {formatWaiting(item.date, now)}
      </span>
    </button>
  )
}

function ComboTitle({ slug }: { slug: string }) {
  return <>{useComboCategoryLabel(slug)}</>
}

function ReviewHeading({ run, title, value, href, now, score }: { run: QueueItem; title: string; value: string; href?: string; now: number; score?: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {href ? (
          <Link href={href} className="font-display text-[40px] font-extrabold uppercase leading-[0.9] hover:underline hover:underline-offset-4 md:text-[56px]">
            {title}
          </Link>
        ) : (
          <span className="font-display text-[40px] font-extrabold uppercase leading-[0.9] md:text-[56px]">{title}</span>
        )}
        <span className="num text-[32px] font-semibold leading-none md:text-[44px]">{value}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
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
        <span title={formatDateTime(run.date)}>Waiting {formatWaiting(run.date, now)}</span>
      </div>
    </div>
  )
}

function ContextFact({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "gold" | "muted" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3">
      <dt className="label-caps text-[13px] text-subtle-foreground">{label}</dt>
      <dd className="m-0 flex flex-col gap-0.5">
        <span className={cn("num text-[20px] font-semibold", tone === "gold" && "text-gold", tone === "muted" && "text-muted-foreground")}>
          {value}
        </span>
        {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  )
}

function TrialReview({ run, wr, records, now }: { run: TrialRun; wr?: WorldRecord; records: readonly WorldRecord[]; now: number }) {
  const { data } = useApi<PlayerDetailResponse>(playerUrl("trial", run.player_uuid))
  const player = data?.data?.player ?? undefined
  const time = Number(run.time)
  const pb = player?.pbs?.find((entry) => entry.trial_name === run.trial_name)
  const wrTime = wr ? Number(wr.time) : null
  const beatsWr = wrTime !== null && time < wrTime
  const trialScore = wrTime ? calculateScore(wrTime, time, run.trial_name as TrialName) : null
  const overall =
    player?.pbs && records.length > 0
      ? estimateScore(player.pbs, records, Number(player.score ?? 0), [{ trial: run.trial_name, time }])
      : null
  const medal = run.video_source_type === "medal" && run.video_source_ref ? run.video_source_ref : null
  const { user } = useAuthSession()

  return (
    <>
      <ReviewHeading
        run={run}
        title={run.trial_name}
        value={formatTime(time)}
        href={trialHref(run.trial_name)}
        now={now}
        score={player?.score ?? run.player_score}
      />
      <RunVideo
        key={run.uuid}
        submissionUuid={run.uuid}
        status={run.video_status}
        errorMessage={run.video_error}
        label={`${run.trial_name} ${formatTime(time)} by ${run.player_name}, run video`}
        fallback={
          medal ? (
            <a href={medal} target="_blank" rel="noreferrer noopener" className="text-sm underline underline-offset-4">
              Open the Medal clip
            </a>
          ) : null
        }
      />
      {user?.uuid === run.player_uuid ? <p className="text-sm text-gold">This is your own run.</p> : null}
      <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line xl:grid-cols-4">
        <ContextFact label="Trial score" value={trialScore === null ? "—" : formatScore(trialScore)} />
        <ContextFact
          label="vs their PB"
          value={pb ? formatDelta(time - Number(pb.time)) : "First run"}
          tone={pb ? undefined : "muted"}
          note={pb ? `PB ${formatTime(pb.time)}` : player ? "No approved run on this trial" : "Loading…"}
        />
        <ContextFact
          label="vs world record"
          value={wrTime === null ? "—" : formatDelta(time - wrTime)}
          tone={beatsWr ? "gold" : undefined}
          note={wr ? (beatsWr ? `New WR, beats ${wr.player_name}` : `WR ${formatTime(wr.time)} by ${wr.player_name}`) : "No record yet"}
        />
        <ContextFact
          label="Their score"
          value={overall ? formatScore(overall.after) : player ? formatScore(player.score) : "—"}
          note={
            overall
              ? overall.after - overall.before >= 0.0005
                ? `${formatDelta(overall.after - overall.before)} from ${formatScore(overall.before)}`
                : "No change"
              : undefined
          }
        />
      </dl>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <RobloxAccounts playerUuid={run.player_uuid} />
        <div className="flex flex-col gap-1.5">
          <span className="label-caps text-[13px] text-subtle-foreground">Proof</span>
          {medal ? (
            <a href={medal} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm hover:underline hover:underline-offset-4">
              Medal clip <ExternalLinkIcon className="size-3 text-subtle-foreground" aria-hidden />
            </a>
          ) : (
            <span className="text-sm">Uploaded video</span>
          )}
        </div>
        {run.moderator_note ? (
          <div className="flex min-w-0 max-w-md flex-col gap-1.5">
            <span className="label-caps text-[13px] text-subtle-foreground">Note</span>
            <span className="text-sm">{run.moderator_note}</span>
          </div>
        ) : null}
      </div>
    </>
  )
}

function ComboReview({ run, now }: { run: ComboRun; now: number }) {
  const { data } = useApi<PlayerDetailResponse>(playerUrl("combo", run.player_uuid))
  const player = data?.data?.player ?? undefined
  const label = useComboCategoryLabel(run.category_slug)
  const best = player?.combo_pbs?.find((entry) => entry.category_slug === run.category_slug)

  return (
    <>
      <ReviewHeading run={run} title={label} value={formatCount(run.combo_count)} now={now} />
      <YoutubeEmbed key={run.uuid} url={run.youtube_url} title={`${label} combo ${formatCount(run.combo_count)} by ${run.player_name}`} />
      <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <ContextFact
          label="vs their best"
          value={best ? `${run.combo_count - best.combo_count >= 0 ? "+" : "−"}${formatCount(Math.abs(run.combo_count - best.combo_count))}` : "First"}
          tone={best ? undefined : "muted"}
          note={best ? `Best ${formatCount(best.combo_count)}` : player ? "No approved combo in this category" : "Loading…"}
        />
        <ContextFact label="Category" value={label} />
      </dl>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <RobloxAccounts playerUuid={run.player_uuid} />
        <div className="flex flex-col gap-1.5">
          <span className="label-caps text-[13px] text-subtle-foreground">Proof</span>
          <a href={run.youtube_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm hover:underline hover:underline-offset-4">
            YouTube <ExternalLinkIcon className="size-3 text-subtle-foreground" aria-hidden />
          </a>
        </div>
        {run.moderator_note ? (
          <div className="flex min-w-0 max-w-md flex-col gap-1.5">
            <span className="label-caps text-[13px] text-subtle-foreground">Note</span>
            <span className="text-sm">{run.moderator_note}</span>
          </div>
        ) : null}
      </div>
    </>
  )
}
