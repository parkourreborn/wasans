"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LockIcon, PlayIcon, SearchIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDate, formatDays, formatDelta, formatScore, formatTime } from "@/lib/format"
import { rememberRunList, type ComboRun, type RunListResponse, type TrialRun } from "@/lib/moderation"
import { tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useComboCategories } from "@/hooks/use-combo-categories"
import { normalizeRunState, StatusBadge, WrBadge } from "@/components/site/status-badge"
import { TierLabel } from "@/components/site/tier-label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatAgo,
  MEDALS,
  medalFor,
  type ActivityEvent,
  type Medal,
  type ProfileComboPb,
  type ProfilePb,
  type RecordHeld,
  type RecordLost,
} from "./profile-data"

export function SectionHeading({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <h2 id={id} className="font-display text-[30px] font-extrabold uppercase leading-none md:text-[34px]">
          {title}
        </h2>
        {children}
      </div>
      {aside}
    </div>
  )
}

export function MedalSwatch({ medal, className }: { medal: Medal; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)}
      style={{ background: MEDALS[medal].fill, boxShadow: MEDALS[medal].ring }}
    />
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; count?: number }>; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "label-caps flex h-8 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors",
            option.value === value
              ? "border-foreground bg-foreground text-background"
              : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className={cn("num text-[12px] tracking-normal", option.value === value ? "text-background/70" : "text-subtle-foreground")}>
              {formatCount(option.count)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

type TrialRow = {
  trial: string
  retired: boolean
  pb: ProfilePb | null
  score: number
  medal: Medal
}

type TrialSort = "score" | "rank" | "recent" | "name"

const trialGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_7rem_8.5rem_13rem_6.5rem_2.25rem] items-center gap-x-3"

export function TrialsSection({ rows, now, own }: { rows: TrialRow[]; now: number; own: boolean }) {
  const [sort, setSort] = useState<TrialSort>("score")
  const [showAll, setShowAll] = useState(false)
  const sorted = [...rows].sort((a, b) => {
    const ra = a.pb?.rank ?? Number.POSITIVE_INFINITY
    const rb = b.pb?.rank ?? Number.POSITIVE_INFINITY
    if (sort === "rank") return ra - rb || b.score - a.score
    if (sort === "recent") return (b.pb?.date ?? 0) - (a.pb?.date ?? 0)
    if (sort === "name") return a.trial.localeCompare(b.trial)
    return b.score - a.score || ra - rb
  })
  const visible = showAll ? sorted : sorted.slice(0, 10)
  const played = rows.filter((row) => row.pb).length

  return (
    <section aria-labelledby="trials-h" id="trials" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading
        id="trials-h"
        title="Trials"
        aside={
          <Segmented
            label="Sort trials"
            value={sort}
            onChange={setSort}
            options={[
              { value: "score", label: "Best score" },
              { value: "rank", label: "Trial rank" },
              { value: "recent", label: "Recent" },
              { value: "name", label: "A–Z" },
            ]}
          />
        }
      />
      <div className="border-t border-line">
        <div className={cn(trialGrid, "hidden h-9 border-b border-line px-3 label-caps text-[13px] text-subtle-foreground md:grid")}>
          <span>Trial</span>
          <span>PB</span>
          <span>Trial rank</span>
          <span>Trial score</span>
          <span>Set</span>
          <span />
        </div>
        <ol className="m-0 list-none p-0">
          {visible.map((row) => {
            const pb = row.pb
            return (
              <li key={row.trial} className={cn(trialGrid, "min-h-12 border-b border-line px-3 py-2 hover:bg-surface")}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MedalSwatch medal={row.medal} />
                    <Link href={trialHref(row.trial)} className="truncate text-[15px] font-medium hover:underline hover:underline-offset-4">
                      {row.trial}
                    </Link>
                    {row.medal === "wr" ? <WrBadge className="h-5 px-1.5 text-[12px]" /> : null}
                    {row.retired ? <span className="label-caps text-[11px] text-subtle-foreground">Retired</span> : null}
                  </span>
                  <span className="pl-5 text-[12px] text-muted-foreground md:hidden">
                    {pb ? (
                      <>
                        <span className="num">#{pb.rank ?? "—"}</span>
                        {pb.holders ? <span className="num text-subtle-foreground"> of {formatCount(pb.holders)}</span> : null} ·{" "}
                        {formatAgo(pb.date, now, formatDate)}
                      </>
                    ) : own ? (
                      "Counts as 0 until you play it"
                    ) : (
                      "Not played"
                    )}
                  </span>
                </span>
                <span className="flex flex-col items-end md:hidden">
                  <span className={cn("num text-[15px] font-semibold", !pb && "text-subtle-foreground")}>{pb ? formatTime(pb.time) : "—"}</span>
                  <span className="num text-[12px] text-muted-foreground">{formatScore(row.score)}</span>
                </span>
                <span className={cn("num hidden text-[15px] font-semibold md:block", !pb && "text-subtle-foreground")}>
                  {pb ? formatTime(pb.time) : "—"}
                </span>
                <span className="num hidden items-baseline gap-1.5 md:flex">
                  {pb?.rank ? (
                    <>
                      <span className={cn("text-[14px]", pb.rank === 1 && "text-gold")}>#{pb.rank}</span>
                      {pb.holders ? <span className="text-[12px] text-subtle-foreground">of {formatCount(pb.holders)}</span> : null}
                    </>
                  ) : (
                    <span className="text-subtle-foreground">—</span>
                  )}
                </span>
                <span className="hidden items-center gap-3 md:flex">
                  <span className={cn("num w-12 text-[14px]", !pb && "text-subtle-foreground")}>{formatScore(row.score)}</span>
                  <span aria-hidden className="relative h-1.5 max-w-36 flex-1 bg-surface-3">
                    <span className="absolute inset-y-0 left-0" style={{ width: `${Math.round(row.score * 100)}%`, background: MEDALS[row.medal].fill }} />
                    <span className="absolute -inset-y-1 left-[30%] w-px bg-[#5a5a5a]" />
                  </span>
                </span>
                <span className="hidden text-[13px] text-muted-foreground md:block">{pb ? formatAgo(pb.date, now, formatDate) : "—"}</span>
                <span className="hidden md:flex">
                  {pb ? (
                    <Link
                      href={`/submissions/${encodeURIComponent(pb.submission_uuid)}`}
                      aria-label={`Watch the ${row.trial} PB`}
                      className="flex size-8 items-center justify-center rounded-md border border-line text-muted-foreground transition-colors hover:border-[#5a5a5a] hover:text-foreground"
                    >
                      <PlayIcon className="size-3.5" />
                    </Link>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {rows.length > 10 ? (
          <Button type="button" variant="outline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show top 10" : `Show all ${rows.length} trials`}
          </Button>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2 text-[13px] text-subtle-foreground">
          <span aria-hidden className="h-3 w-px bg-[#5a5a5a]" />
          The tick marks the platinum time, worth 0.300. {played} of {rows.length} played.
        </span>
      </div>
    </section>
  )
}

function RecordLead({ trial, time }: { trial: string; time: number }) {
  const { data } = useApi<{ data?: { results?: Array<{ time: number }> } }>(
    `${apiV2(`/leaderboards/trials/${encodeURIComponent(trial)}`)}?limit=2&page=1`
  )
  const second = data?.data?.results?.[1]
  return <span className="num">{second ? (Number(second.time) - time).toFixed(3) : "—"}</span>
}

export function RecordsSection({ held, lost, allTime, now }: { held: RecordHeld[]; lost: RecordLost[]; allTime: number; now: number }) {
  return (
    <section aria-labelledby="records-h" id="records" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading
        id="records-h"
        title="Records"
        aside={
          <span className="text-[13px] text-muted-foreground">
            <span className="num text-gold">{held.length}</span> held, <span className="num text-foreground">{allTime}</span> all-time
          </span>
        }
      />
      {held.length > 0 ? (
        <div className="border-t border-line">
          <div className="grid h-9 grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5.5rem] items-center gap-x-3 border-b border-line px-2 label-caps text-[13px] text-subtle-foreground">
            <span>Holding</span>
            <span className="text-right">Time</span>
            <span className="text-right">Lead</span>
            <span className="text-right">Held</span>
          </div>
          {held.map((record) => (
            <div key={record.trial} className="grid min-h-11 grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5.5rem] items-center gap-x-3 border-b border-line px-2 hover:bg-surface">
              <span className="flex min-w-0 items-center gap-2.5">
                <MedalSwatch medal="wr" />
                <Link href={`/submissions/${encodeURIComponent(record.submission_uuid)}`} className="truncate text-[15px] font-medium hover:underline hover:underline-offset-4">
                  {record.trial}
                </Link>
              </span>
              <span className="num text-right text-[14px] font-semibold">{formatTime(record.time)}</span>
              <span className="text-right text-[13px] text-muted-foreground">
                <RecordLead trial={record.trial} time={record.time} />
              </span>
              <span className="text-right text-[13px] text-muted-foreground">{formatDays(Math.max(0, Math.floor((now - record.since) / 86400)))}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No current world records.</p>
      )}
      {lost.length > 0 ? (
        <div className="border-t border-line">
          <div className="grid h-9 grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6.5rem] items-center gap-x-3 border-b border-line px-2 label-caps text-[13px] text-subtle-foreground">
            <span>Former</span>
            <span className="text-right">Time</span>
            <span className="text-right">Held</span>
            <span className="text-right">Taken by</span>
          </div>
          {lost.slice(0, 12).map((record) => (
            <div key={`${record.trial}-${record.set}`} className="grid min-h-11 grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6.5rem] items-center gap-x-3 border-b border-line px-2 hover:bg-surface">
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_var(--gold)]" />
                <Link href={trialHref(record.trial)} className="truncate text-[15px] text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4">
                  {record.trial}
                </Link>
              </span>
              <span className="num text-right text-[14px] text-muted-foreground">{formatTime(record.time)}</span>
              <span className="text-right text-[13px] text-muted-foreground">{formatDays(Math.max(0, Math.floor(record.held / 86400)))}</span>
              <Link href={`/players/${encodeURIComponent(record.takenByUuid)}`} className="truncate text-right text-[13px] hover:underline hover:underline-offset-4">
                {record.takenBy}
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

const KIND_TAG: Record<ActivityEvent["kind"], { tag: string; className: string }> = {
  pb: { tag: "PB", className: "text-foreground" },
  wr: { tag: "WR", className: "text-gold" },
  lost: { tag: "Lost WR", className: "text-destructive" },
  tier: { tag: "Tier", className: "text-primary" },
  affected: { tag: "Score", className: "text-muted-foreground" },
  trial: { tag: "Trials", className: "text-muted-foreground" },
}

export function ActivitySection({ events, pbs, now }: { events: ActivityEvent[]; pbs: Map<string, ProfilePb>; now: number }) {
  const [limit, setLimit] = useState(8)
  return (
    <section aria-labelledby="activity-h" id="activity" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading id="activity-h" title="Activity" aside={<span className="text-[13px] text-muted-foreground">PBs, records and milestones</span>} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="m-0 list-none border-t border-line p-0">
          {events.slice(0, limit).map((event, index) => {
            const tag = KIND_TAG[event.kind]
            const pb = event.trial ? pbs.get(event.trial) : undefined
            const time = event.submission_uuid && pb?.submission_uuid === event.submission_uuid ? pb.time : null
            return (
              <li key={`${event.kind}-${event.at}-${index}`} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line px-1 py-3">
                <span className={cn("label-caps whitespace-nowrap text-[14px]", tag.className)}>{tag.tag}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] leading-snug">
                    {event.text}{" "}
                    {event.trial ? (
                      event.submission_uuid ? (
                        <Link href={`/submissions/${encodeURIComponent(event.submission_uuid)}`} className="font-semibold hover:underline hover:underline-offset-4">
                          {event.trial}
                        </Link>
                      ) : (
                        <Link href={trialHref(event.trial)} className="font-semibold hover:underline hover:underline-offset-4">
                          {event.trial}
                        </Link>
                      )
                    ) : null}
                  </span>
                  {time !== null || event.delta !== null ? (
                    <span className="text-[13px] text-muted-foreground">
                      {time !== null ? <span className="num text-foreground">{formatTime(time)} </span> : null}
                      {event.delta !== null && Math.abs(event.delta) >= 0.0005 ? (
                        <span className="num">score {formatDelta(event.delta)}</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[12px] text-subtle-foreground">{formatAgo(event.at, now, formatDate)}</span>
              </li>
            )
          })}
        </ol>
      )}
      {events.length > limit ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => setLimit(limit + 16)}>
          Show older
        </Button>
      ) : null}
    </section>
  )
}

export function CombosSection({ combos, now }: { combos: ProfileComboPb[]; now: number }) {
  const { categories } = useComboCategories()
  const label = (slug: string) => categories.find((category) => category.slug === slug)?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1)
  return (
    <section aria-labelledby="combos-h" id="combos" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading id="combos-h" title="Combos" aside={<span className="text-[13px] text-muted-foreground">Best approved combo per category</span>} />
      {combos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No approved combos yet.</p>
      ) : (
        <div className="border-t border-line">
          {combos.map((combo) => (
            <div key={combo.category_slug} className="grid min-h-11 grid-cols-[minmax(0,1fr)_6rem_6.5rem] items-center gap-x-3 border-b border-line px-2 hover:bg-surface">
              <Link href={`/combos?category=${encodeURIComponent(combo.category_slug)}`} className="truncate text-[15px] font-medium hover:underline hover:underline-offset-4">
                {label(combo.category_slug)}
              </Link>
              <Link href={`/submissions/${encodeURIComponent(combo.submission_uuid)}`} className="num text-right text-[15px] font-semibold hover:underline hover:underline-offset-4">
                {formatCount(combo.combo_count)}
              </Link>
              <span className="text-right text-[13px] text-muted-foreground">{formatAgo(combo.date, now, formatDate)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

type RunKindTab = "trial" | "combo"
type StateFilter = "all" | "approved" | "pending" | "denied"
const RUNS_PER_PAGE = 20

// `query` matches part of a trial's name (or a combo category's).
function runsUrl(kind: RunKindTab, playerUuid: string, state: StateFilter, page: number, query: string, limit = RUNS_PER_PAGE) {
  const params = new URLSearchParams({ player_uuid: playerUuid, page: String(page), limit: String(limit) })
  if (state !== "all") params.set("state", state)
  if (query) params.set(kind === "trial" ? "trial_search" : "category_search", query)
  return `${apiV2(kind === "trial" ? "/submissions" : "/combo-submissions")}?${params.toString()}`
}

function useRunCount(kind: RunKindTab, playerUuid: string, state: StateFilter, query: string) {
  const { data } = useApi<RunListResponse<unknown>>(runsUrl(kind, playerUuid, state, 1, query, 1))
  return data?.meta?.count
}

export function RunsSection({ playerUuid, wrUuids, now }: { playerUuid: string; wrUuids: ReadonlySet<string>; now: number }) {
  const [kind, setKind] = useState<RunKindTab>("trial")
  const [state, setState] = useState<StateFilter>("all")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const counts = {
    all: useRunCount(kind, playerUuid, "all", query),
    approved: useRunCount(kind, playerUuid, "approved", query),
    pending: useRunCount(kind, playerUuid, "pending", query),
    denied: useRunCount(kind, playerUuid, "denied", query),
  }
  const { data, loading } = useApi<RunListResponse<TrialRun | ComboRun>>(runsUrl(kind, playerUuid, state, page, query))

  // Filter a beat after the last key rather than on every keystroke.
  useEffect(() => {
    const next = search.trim()
    if (next === query) return
    const timer = window.setTimeout(() => {
      setQuery(next)
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, query])
  const runs = data?.data ?? []
  const total = data?.meta?.count ?? 0
  const pages = Math.max(1, Math.ceil(total / RUNS_PER_PAGE))
  const { categories } = useComboCategories()
  const comboLabel = (slug: string) => categories.find((category) => category.slug === slug)?.label ?? slug

  return (
    <section aria-labelledby="runs-h" id="runs" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading
        id="runs-h"
        title="Runs"
        aside={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Run type"
              value={kind}
              onChange={(next) => {
                setKind(next)
                setPage(1)
                setSearch("")
                setQuery("")
              }}
              options={[
                { value: "trial", label: "Trials" },
                { value: "combo", label: "Combos" },
              ]}
            />
            <Segmented
              label="Filter by status"
              value={state}
              onChange={(next) => {
                setState(next)
                setPage(1)
              }}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "approved", label: "Approved", count: counts.approved },
                { value: "pending", label: "Pending", count: counts.pending },
                { value: "denied", label: "Denied", count: counts.denied },
              ]}
            />
          </div>
        }
      />
      <label className="relative block w-full sm:max-w-xs">
        <span className="sr-only">{kind === "trial" ? "Search runs by trial" : "Search combos by category"}</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("")
          }}
          placeholder={kind === "trial" ? "Search by trial" : "Search by category"}
          className="h-9 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </label>
      <div className="border-t border-line">
        {loading ? (
          <div className="flex flex-col gap-2 py-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {query
              ? `No ${state === "all" ? "" : `${state} `}${kind === "trial" ? "runs on a trial" : "combos in a category"} matching “${query}”.`
              : "No runs here."}
          </p>
        ) : (
          <ol className="m-0 list-none p-0">
            {runs.map((run) => {
              const trial = "trial_name" in run
              const runState = normalizeRunState(run.state)
              return (
                <li key={run.uuid}>
                  <Link
                    href={`/submissions/${encodeURIComponent(run.uuid)}`}
                    onClick={() => rememberRunList(runs.map((item) => item.uuid))}
                    className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line px-2 py-2 hover:bg-surface sm:grid-cols-[6.5rem_minmax(0,1fr)_7rem_7.5rem_3rem]"
                  >
                    <span className="hidden text-[13px] text-muted-foreground sm:block">{formatAgo(run.date, now, formatDate)}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-medium">{trial ? run.trial_name : comboLabel(run.category_slug)}</span>
                      <span className="text-[12px] text-muted-foreground sm:hidden">{formatAgo(run.date, now, formatDate)}</span>
                    </span>
                    <span className={cn("num text-right text-[15px] font-semibold sm:text-left", runState === "denied" && "text-muted-foreground")}>
                      {trial ? formatTime(run.time) : formatCount(run.combo_count)}
                    </span>
                    <span className="hidden sm:flex">
                      <StatusBadge state={runState} />
                    </span>
                    <span className="hidden sm:flex">{trial && wrUuids.has(run.uuid) ? <WrBadge className="h-5 px-1.5 text-[12px]" /> : null}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {pages > 1 ? (
        <nav aria-label="Run pages" className="flex items-center justify-center gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span className="num px-3 text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
    </section>
  )
}

type GainsResponse = {
  data?: {
    score: number
    rank: number
    peers: { from: number; to: number; count: number }
    gains: Array<{ trial_name: string; pb_time: number | null; pb_score: number; typical_time: number; typical_score: number; gain: number; rank_after: number }>
    combined: { gain: number; score_after: number; rank_after: number } | null
  }
}

export function GainsSection({ playerUuid }: { playerUuid: string }) {
  const { data, loading, error } = useApi<GainsResponse>(apiV2(`/players/${encodeURIComponent(playerUuid)}/gains`))
  const gains = data?.data
  const top = gains?.gains ?? []
  const maxGain = top[0]?.gain ?? 1
  const medal = (trial: string, time: number | null) => MEDALS[medalFor(trial, time, false)].label

  return (
    <section aria-labelledby="gains-h" id="gains" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHeading
        id="gains-h"
        title="Biggest gains"
        aside={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[12px] text-muted-foreground">
            <LockIcon className="size-3" aria-hidden />
            Only you see this
          </span>
        }
      >
        <p className="m-0 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          The trials where you&apos;re furthest behind players at your level. Matching the typical time there adds the most to your score.
        </p>
      </SectionHeading>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error && !gains ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t work this out right now.</p>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re at or ahead of the typical time for your level on every trial. Nice.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ol className="m-0 list-none border-t border-line p-0">
            {top.map((item, index) => (
              <li
                key={item.trial_name}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-line px-2 py-3 md:grid-cols-[1.5rem_minmax(0,1fr)_8rem_8.5rem_12rem_4.5rem]"
              >
                <span className="num text-[13px] text-subtle-foreground">{index + 1}</span>
                <Link href={trialHref(item.trial_name)} className="truncate text-[15px] font-medium hover:underline hover:underline-offset-4">
                  {item.trial_name}
                </Link>
                <span className="num text-right text-[15px] font-semibold md:hidden">{formatDelta(item.gain)}</span>
                <span className="col-start-2 col-end-4 text-[13px] text-muted-foreground md:hidden">
                  <span className="num">{item.pb_time === null ? "Not played" : formatTime(item.pb_time)}</span> to{" "}
                  <span className="num text-foreground">{formatTime(item.typical_time)}</span> · about #{item.rank_after}
                </span>
                <span className="hidden flex-col md:flex">
                  <span className={cn("num text-[14px]", item.pb_time === null && "text-muted-foreground")}>{item.pb_time === null ? "Not played" : formatTime(item.pb_time)}</span>
                  <span className="text-[12px] text-subtle-foreground">{item.pb_time === null ? "Counts as 0" : medal(item.trial_name, item.pb_time)}</span>
                </span>
                <span className="hidden flex-col md:flex">
                  <span className="num text-[14px] font-semibold">{formatTime(item.typical_time)}</span>
                  <span className="text-[12px] text-subtle-foreground">Typical, {medal(item.trial_name, item.typical_time).toLowerCase()}</span>
                </span>
                <span className="hidden items-center gap-2.5 md:flex">
                  <span className="num w-14 text-[15px] font-semibold">{formatDelta(item.gain)}</span>
                  <span aria-hidden className="h-2 flex-1 bg-surface-3">
                    <span className="block h-full bg-primary" style={{ width: `${Math.round((item.gain / maxGain) * 100)}%` }} />
                  </span>
                </span>
                <span className="num hidden text-right text-[13px] text-muted-foreground md:block">#{item.rank_after}</span>
              </li>
            ))}
          </ol>
          {gains?.combined ? (
            <aside aria-label={`If you matched all ${top.length}`} className="flex flex-col gap-3 rounded-lg border border-primary bg-surface-2 p-5">
              <span className="label-caps text-[14px] text-muted-foreground">If you matched all {top.length}</span>
              <div className="flex items-baseline gap-3">
                <span className="num text-[20px] text-subtle-foreground">{formatScore(gains.score)}</span>
                <span className="text-subtle-foreground" aria-label="to">→</span>
                <span className="num text-[38px] font-semibold leading-none">{formatScore(gains.combined.score_after)}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Rank <span className="num text-foreground">#{gains.rank}</span> to about <span className="num text-foreground">#{gains.combined.rank_after}</span>
              </span>
              <TierLabel tier={tierForScore(gains.combined.score_after)} className="text-[14px]" />
            </aside>
          ) : null}
        </div>
      )}
      {gains ? (
        <p className="text-[13px] leading-relaxed text-subtle-foreground">
          Typical is the median PB of the {gains.peers.count} players ranked closest to you (#{gains.peers.from} to #{gains.peers.to}); a
          player without a PB counts as 0, as they do in the score. Places are estimates.
        </p>
      ) : null}
    </section>
  )
}

export type { TrialRow }
