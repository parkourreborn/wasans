"use client"

import { useCallback, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftRightIcon, CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatDelta, formatScore, formatTime } from "@/lib/format"
import { countedTrials, trialScorer } from "@/lib/score-estimate"
import { parseRunTime, TIME_DRAFT_PATTERN } from "@/lib/submission-input"
import { tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PageHeader } from "@/components/site/page-header"
import { PlayerPicker, type PickedPlayer } from "@/components/site/player-picker"
import { TierLabel } from "@/components/site/tier-label"
import type { WorldRecordsResponse } from "@/components/site/trials-index"
import { Button } from "@/components/ui/button"

type Pb = { trial_name: string; time: number; submission_uuid: string }
type PlayerDetail = PickedPlayer & { pbs?: Pb[] }
type PlayerDetailResponse = { data?: { player?: PlayerDetail | null } }

type Edits = Record<string, string>

// What-if times stay on this device, per player, until reset.
const EDITS_EVENT = "wasans:compare-edits"
const editsKey = (uuid: string | null) => `wasans:compare-edits:${uuid ?? "blank"}`

function subscribeEdits(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener(EDITS_EVENT, listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener(EDITS_EVENT, listener)
  }
}

function useStoredEdits(uuid: string | null): [Edits, (next: Edits) => void] {
  const key = editsKey(uuid)
  const raw = useSyncExternalStore(
    subscribeEdits,
    () => {
      try {
        return window.localStorage.getItem(key) ?? "{}"
      } catch {
        return "{}"
      }
    },
    () => "{}"
  )
  let edits: Edits = {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") edits = parsed as Edits
  } catch {
    edits = {}
  }
  const save = useCallback(
    (next: Edits) => {
      try {
        if (Object.keys(next).length === 0) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage blocked: edits just won't survive a reload.
      }
      window.dispatchEvent(new Event(EDITS_EVENT))
    },
    [key]
  )
  return [edits, save]
}

type Side = {
  uuid: string | null
  player: PlayerDetail | null
  loading: boolean
  edits: Edits
  setEdits: (next: Edits) => void
  pbTime: (trial: string) => number | null
  time: (trial: string) => number | null
  shown: (trial: string) => string
  edited: (trial: string) => boolean
  official: number
  score: number
  editCount: number
  exact: number
}

function useSide(uuid: string | null, trials: readonly string[], records: WorldRecordsResponse["data"]): Side {
  const { data, loading } = useApi<PlayerDetailResponse>(uuid ? apiV2(`/players/${encodeURIComponent(uuid)}?include=pbs`) : null)
  const player = data?.data?.player ?? null
  const [edits, setEdits] = useStoredEdits(uuid)
  const recordList = records ?? []
  const score = trialScorer(recordList)
  const pbs = new Map((player?.pbs ?? []).map((pb) => [pb.trial_name, Number(pb.time)]))
  const official = player ? Number(player.score ?? 0) : 0
  const count = player ? countedTrials(player.pbs ?? [], recordList, official) : Math.max(recordList.length, 1)

  const pbTime = (trial: string) => pbs.get(trial) ?? null
  const edited = (trial: string) => trial in edits
  const time = (trial: string) => (edited(trial) ? parseRunTime(edits[trial]) : pbTime(trial))
  const shown = (trial: string) => {
    if (edited(trial)) return edits[trial]
    const pb = pbTime(trial)
    return pb === null ? "" : pb.toFixed(3)
  }

  let gained = 0
  for (const trial of trials) {
    if (!edited(trial)) continue
    const before = pbTime(trial)
    const after = time(trial)
    gained += (after === null ? 0 : score(trial, after)) - (before === null ? 0 : score(trial, before))
  }
  const exact = official + gained / count

  return {
    uuid,
    player,
    loading: Boolean(uuid) && loading,
    edits,
    setEdits,
    pbTime,
    time,
    shown,
    edited,
    official,
    score: exact,
    editCount: Object.keys(edits).filter((trial) => trials.includes(trial)).length,
    exact,
  }
}

// /compare: two players trial by trial, and what-if times for either.
// It replaces the separate calculator: type over any time to see the score
// it would give.
export function ComparePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuthSession()
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const { data: wrData } = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const records = wrData?.data ?? []
  const wrByTrial = new Map(records.map((record) => [record.trial_name, record]))
  const scoreOf = trialScorer(records)

  // With no ?a=, the first column is you (or blank times when logged out).
  // ?player_uuid= and ?player= are the old calculator links.
  const aParam = searchParams.get("a") ?? searchParams.get("player_uuid") ?? searchParams.get("player")
  const aUuid = aParam === "none" ? null : aParam || user?.uuid || null
  const bUuid = searchParams.get("b") || null
  const a = useSide(aUuid, orderedTrialNames, records)
  const b = useSide(bUuid, orderedTrialNames, records)
  const hasB = Boolean(bUuid)

  const me: PickedPlayer | null = user
    ? { uuid: user.uuid, player_name: user.player_name, score: Number(user.score), discord_id: user.discord_id, discord_avatar: user.discord_avatar, discord_discriminator: user.discord_discriminator, has_roblox_avatar: user.has_roblox_avatar }
    : null

  const setParams = (next: { a?: string | null; b?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const swap = () => setParams({ a: bUuid ?? "none", b: aUuid })

  let aAhead = 0
  let bAhead = 0
  if (hasB) {
    for (const trial of orderedTrialNames) {
      const at = a.time(trial)
      const bt = b.time(trial)
      if (at !== null && (bt === null || at < bt)) aAhead += 1
      else if (bt !== null && (at === null || bt < at)) bAhead += 1
    }
  }

  const grid = hasB
    ? "grid grid-cols-[minmax(0,1fr)_minmax(0,7.5rem)_minmax(0,7.5rem)] md:grid-cols-[minmax(0,1fr)_8rem_5rem_9.5rem_5rem_6rem] items-center gap-x-3"
    : "grid grid-cols-[minmax(0,1fr)_8rem_4.5rem] md:grid-cols-[minmax(0,1fr)_8rem_5rem_7rem] items-center gap-x-3"

  return (
    <>
      <PageHeader
        title="Compare"
        description="Line two players up trial by trial, or type over any time to see what it would do to a score."
      />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PlayerPicker
            label="First player"
            value={a.player}
            me={me}
            exclude={bUuid}
            placeholder="Start from a player's PBs"
            onChange={(player) => setParams({ a: player ? player.uuid : "none" })}
            clearable
          />
          <button
            type="button"
            onClick={swap}
            disabled={!hasB}
            aria-label="Swap players"
            className="flex size-9 shrink-0 items-center justify-center self-center rounded-md border border-line-strong text-muted-foreground transition-colors hover:border-[#5a5a5a] hover:text-foreground disabled:opacity-40"
          >
            <ArrowLeftRightIcon className="size-4" />
          </button>
          <PlayerPicker
            label="Second player"
            value={b.player}
            me={me}
            exclude={aUuid}
            placeholder="Add a player to compare"
            onChange={(player) => setParams({ b: player ? player.uuid : null })}
            clearable
          />
        </div>

        <div className={cn("grid gap-3", hasB ? "grid-cols-2" : "sm:max-w-md")}>
          <ScoreCard side={a} fallbackName="Your times" />
          {hasB ? <ScoreCard side={b} fallbackName="Player" /> : null}
        </div>

        {hasB && a.player && b.player ? (
          <p className="text-[15px] text-muted-foreground">
            <span className="text-foreground">{a.player.player_name}</span> is faster on{" "}
            <span className="num text-foreground">{aAhead}</span> {aAhead === 1 ? "trial" : "trials"},{" "}
            <span className="text-foreground">{b.player.player_name}</span> on <span className="num text-foreground">{bAhead}</span>.
          </p>
        ) : null}

        <div className={cn("border-t border-line", !hasB && "max-w-3xl")}>
          <div className={cn(grid, "h-10 border-b border-line px-2 label-caps text-[13px] text-subtle-foreground", !hasB && "max-w-3xl")}>
            <span>Trial</span>
            {hasB ? (
              <>
                <span className="truncate md:hidden">{a.player?.player_name ?? "Times"}</span>
                <span className="truncate md:hidden">{b.player?.player_name ?? "Player"}</span>
                <span className="hidden truncate md:block">{a.player?.player_name ?? "Times"}</span>
                <span className="hidden text-right md:block">Score</span>
                <span className="hidden truncate md:block md:pl-6">{b.player?.player_name ?? "Player"}</span>
                <span className="hidden text-right md:block">Score</span>
                <span className="hidden text-right md:block">Gap</span>
              </>
            ) : (
              <>
                <span>Time</span>
                <span className="text-right">Score</span>
                <span className="hidden text-right md:block">vs WR</span>
              </>
            )}
          </div>
          <ol className="m-0 list-none p-0">
            {orderedTrialNames.map((trial) => {
              const wr = wrByTrial.get(trial)
              const at = a.time(trial)
              const bt = b.time(trial)
              const gap = at !== null && bt !== null ? at - bt : null
              return (
                <li key={trial} className={cn(grid, "min-h-14 border-b border-line px-2 py-1.5 hover:bg-surface")}>
                  <span className="flex min-w-0 flex-col">
                    <Link href={trialHref(trial)} className="truncate text-[15px] font-medium hover:underline hover:underline-offset-4">
                      {trial}
                    </Link>
                    <span className="truncate text-xs text-subtle-foreground">
                      {removedTrials.has(trial) ? "Retired · " : ""}WR <span className="num">{wr ? formatTime(wr.time) : "—"}</span>
                    </span>
                  </span>
                  {hasB ? (
                    <>
                      <MobileCell side={a} trial={trial} scoreOf={scoreOf} />
                      <MobileCell side={b} trial={trial} scoreOf={scoreOf} />
                      <span className="hidden md:block">
                        <TimeInput side={a} trial={trial} />
                      </span>
                      <ScoreCell side={a} trial={trial} scoreOf={scoreOf} className="hidden md:flex" />
                      <span className="hidden md:block md:pl-6">
                        <TimeInput side={b} trial={trial} />
                      </span>
                      <ScoreCell side={b} trial={trial} scoreOf={scoreOf} className="hidden md:flex" />
                      <span
                        className={cn(
                          "num hidden text-right text-sm md:block",
                          gap === null ? "text-subtle-foreground" : gap < 0 ? "text-foreground" : "text-muted-foreground"
                        )}
                        title={gap === null ? undefined : gap < 0 ? `${a.player?.player_name ?? "First"} is faster` : `${b.player?.player_name ?? "Second"} is faster`}
                      >
                        {gap === null ? "—" : formatDelta(gap)}
                      </span>
                    </>
                  ) : (
                    <>
                      <TimeInput side={a} trial={trial} />
                      <ScoreCell side={a} trial={trial} scoreOf={scoreOf} />
                      <span className="num hidden text-right text-sm text-muted-foreground md:block">
                        {at !== null && wr ? formatDelta(at - Number(wr.time)) : "—"}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
        <p className="text-[13px] leading-relaxed text-subtle-foreground">
          Edited times are marked and stay on this device. A score of 0.300 means platinum; times faster than the WR count as a
          new record. {hasB ? "The gap is the first player's time minus the second's." : ""}
        </p>
      </div>
    </>
  )
}

function ScoreCard({ side, fallbackName }: { side: Side; fallbackName: string }) {
  const [copied, setCopied] = useState(false)
  const name = side.player?.player_name ?? fallbackName
  const changed = side.editCount > 0
  const delta = side.score - side.official

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(side.exact.toFixed(15).replace(/\.?0+$/, ""))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }

  return (
    <section aria-label={`${name}'s score`} className={cn("flex flex-col gap-2 rounded-lg border bg-surface p-4", changed ? "border-primary/60" : "border-line")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-medium">{side.loading ? "Loading…" : name}</span>
        {side.player ? <TierLabel tier={tierForScore(side.score)} className="text-[13px]" /> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {changed && side.player ? (
          <>
            <span className="num text-[15px] text-muted-foreground">{formatScore(side.official)}</span>
            <span className="text-subtle-foreground" aria-label="becomes">→</span>
          </>
        ) : null}
        <span className="num text-[26px] font-semibold leading-none sm:text-[32px]">{formatScore(side.score)}</span>
        {changed && side.player && Math.abs(delta) >= 0.0005 ? (
          <span className={cn("num text-sm", delta > 0 ? "text-success" : "text-destructive")}>{formatDelta(delta)}</span>
        ) : null}
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-subtle-foreground hover:text-foreground"
          title="Copy the score with every decimal"
        >
          {copied ? <CheckIcon className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Exact"}
        </button>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span>
          {changed
            ? `${side.editCount} ${side.editCount === 1 ? "time" : "times"} changed`
            : side.player
              ? side.player.rank
                ? `Rank #${side.player.rank}`
                : "Unranked"
              : "Type times below to work out a score"}
        </span>
        {changed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => side.setEdits({})}>
            <RotateCcwIcon />
            Reset
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function TimeInput({ side, trial }: { side: Side; trial: string }) {
  const edited = side.edited(trial)
  const pb = side.pbTime(trial)
  const name = side.player?.player_name ?? "Your"
  const update = (value: string) => {
    if (!TIME_DRAFT_PATTERN.test(value)) return
    const next = { ...side.edits }
    const original = pb === null ? "" : pb.toFixed(3)
    if (value === original) delete next[trial]
    else next[trial] = value
    side.setEdits(next)
  }
  const reset = () => {
    const next = { ...side.edits }
    delete next[trial]
    side.setEdits(next)
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <input
        value={side.shown(trial)}
        onChange={(event) => update(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        aria-label={`${name} ${trial} time`}
        className={cn(
          "num h-9 w-full min-w-0 rounded-md border bg-transparent px-2 text-[15px] outline-none transition-colors placeholder:text-subtle-foreground hover:border-line-strong focus:border-ring focus:bg-surface-2",
          edited ? "border-primary/70 bg-primary/5" : "border-transparent"
        )}
      />
      {edited ? (
        <button
          type="button"
          onClick={reset}
          aria-label={`Reset ${trial} to ${pb === null ? "no time" : formatTime(pb)}`}
          title={pb === null ? "Back to no time" : `Back to the PB, ${formatTime(pb)}`}
          className="flex size-7 shrink-0 items-center justify-center rounded text-subtle-foreground hover:bg-surface-3 hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

function ScoreCell({
  side,
  trial,
  scoreOf,
  className,
}: {
  side: Side
  trial: string
  scoreOf: (trial: string, time: number) => number
  className?: string
}) {
  const time = side.time(trial)
  const pb = side.pbTime(trial)
  const value = time === null ? 0 : scoreOf(trial, time)
  const before = pb === null ? 0 : scoreOf(trial, pb)
  const changed = side.edited(trial) && Math.abs(value - before) >= 0.0005
  return (
    <span className={cn("flex flex-col items-end leading-tight", className)}>
      <span className={cn("num text-[15px]", time === null && "text-subtle-foreground")}>{formatScore(value)}</span>
      {changed ? (
        <span className={cn("num text-[11px]", value > before ? "text-success" : "text-destructive")}>{formatDelta(value - before)}</span>
      ) : null}
    </span>
  )
}

// Phones with two players: each cell stacks the time over its score.
function MobileCell({ side, trial, scoreOf }: { side: Side; trial: string; scoreOf: (trial: string, time: number) => number }) {
  const time = side.time(trial)
  return (
    <span className="flex min-w-0 flex-col gap-0.5 md:hidden">
      <TimeInput side={side} trial={trial} />
      <span className="num pl-2 text-[12px] text-muted-foreground">{formatScore(time === null ? 0 : scoreOf(trial, time))}</span>
    </span>
  )
}
