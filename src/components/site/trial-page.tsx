"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LocateFixedIcon, PlayIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { daysBetween, formatAge, formatCount, formatDate, formatDays, formatDelta, formatScore, formatTime } from "@/lib/format"
import { bronze, plats, type TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useNow } from "@/hooks/use-now"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useSettings } from "@/components/custom/settings-provider"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PageHeader } from "@/components/site/page-header"
import { RunVideo } from "@/components/site/run-video"
import { Pager } from "@/components/site/pager"
import { RankCell } from "@/components/site/rank-cell"
import type { WorldRecord, WorldRecordsResponse } from "@/components/site/trials-index"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 50

type BoardRow = {
  player_uuid: string
  player_name: string
  time: number
  submission_uuid: string
  date?: number
  rank?: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type MyEntry = { time: number; submission_uuid: string; date: number; rank: number; position: number }

type BoardResponse = {
  data?: { wr?: { submission_uuid: string; time: number } | null; results?: BoardRow[]; player?: MyEntry | null }
  meta?: { total?: number }
}

type HistoryRow = {
  uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type HistoryResponse = { data?: HistoryRow[] }

// Desktop: Pos | Player | Time | Gap | Score | Date | play. Phones: Pos |
// Player (date under) | Time (gap under).
const boardGrid =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_6rem] md:grid-cols-[4rem_minmax(0,1fr)_6.5rem_6rem_5.5rem_7.5rem_2rem] items-center gap-x-3"

// Desktop: Date | Time | Holder | Improved by | Stood. Phones: Holder (date
// under) | Time (improvement under).
const historyGrid =
  "grid grid-cols-[minmax(0,1fr)_6.5rem] md:grid-cols-[8.5rem_7rem_minmax(0,1fr)_7rem_8rem] items-center gap-x-3"

function pageFrom(value: string | null) {
  const page = Math.floor(Number(value))
  return Number.isFinite(page) && page > 1 ? page : 1
}

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="label-caps text-[13px] text-subtle-foreground">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  )
}

// The record plays right on the trial page. No autoplay: a full run on
// every visit would be a lot of mobile data.
function WrVideo({ trial, wr, showPoster }: { trial: string; wr: WorldRecord; showPoster: boolean }) {
  const runHref = `/submissions/${encodeURIComponent(wr.submission_uuid)}`

  return (
    <figure className="m-0 flex flex-col gap-2">
      <RunVideo
        submissionUuid={wr.submission_uuid}
        showPoster={showPoster}
        label={`${trial} world record by ${wr.player_name}, ${formatTime(wr.time)}`}
        fallback={
          <Link href={runHref} className="label-caps text-[15px] underline decoration-primary underline-offset-4">
            Open the run page
          </Link>
        }
      />
      <figcaption className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="min-w-0 truncate">
          World record by {wr.player_name}, set {formatDate(wr.date)}
        </span>
        <Link href={runHref} className="shrink-0 hover:text-foreground">
          Run details
        </Link>
      </figcaption>
    </figure>
  )
}

export function TrialPage({ trial }: { trial: TrialName }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") === "history" ? "history" : "board"
  const page = pageFrom(searchParams.get("page"))
  const focusMe = searchParams.get("focus") === "me"
  const { user } = useAuthSession()
  const { removedTrials } = useTrialOrder()
  const settings = useSettings()
  const showThumbnails = !(settings?.disableSubmissionThumbnails ?? false)
  const retired = removedTrials.has(trial)

  const records = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const wr = records.data?.data?.find((record) => record.trial_name === trial) ?? null

  const boardUrl = `${apiV2(`/leaderboards/trials/${encodeURIComponent(trial)}`)}?page=${page}&limit=${PAGE_SIZE}${
    user ? `&player=${encodeURIComponent(user.uuid)}` : ""
  }`
  const board = useApi<BoardResponse>(boardUrl)
  const history = useApi<HistoryResponse>(tab === "history" ? apiV2(`/records/world/history/${encodeURIComponent(trial)}`) : null)

  const wrTime = wr ? Number(wr.time) : board.data?.data?.wr?.time ?? null
  const mine = board.data?.data?.player ?? null
  const total = board.data?.meta?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const now = useNow()

  const scoreFor = useCallback(
    (time: number) => (wrTime && time > 0 ? calculateScore(wrTime, time, trial) : null),
    [wrTime, trial]
  )

  const rows = useMemo(() => {
    const results = board.data?.data?.results ?? []
    return results.map((row, index) => {
      const time = Number(row.time)
      return {
        ...row,
        time,
        rank: row.rank ?? (page - 1) * PAGE_SIZE + index + 1,
        gap: wrTime ? time - wrTime : null,
        score: scoreFor(time),
        isMe: row.player_uuid === user?.uuid,
      }
    })
  }, [board.data, page, wrTime, scoreFor, user?.uuid])

  // After a trial version change the newest entry in the chain may not be
  // the record that counts now, so "current" matches the real WR. (The
  // React Compiler memoizes this; a manual useMemo can't be preserved.)
  const currentWrUuid = wr?.submission_uuid ?? null
  const chain = history.data?.data ?? []
  const historyRows = chain
    .map((row, index) => {
      const previous = index > 0 ? chain[index - 1] : null
      const next = index < chain.length - 1 ? chain[index + 1] : null
      return {
        ...row,
        improvement: previous ? Number(row.time) - Number(previous.time) : null,
        stoodDays: daysBetween(row.date, next ? next.date : now),
        current: currentWrUuid ? row.uuid === currentWrUuid : !next,
      }
    })
    // The API returns the chain oldest first; show the newest first.
    .reverse()

  // The "you" bar hides while your row is on screen.
  const [meInView, setMeInView] = useState(false)
  const myRowRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (!node) {
        return
      }
      if (focusMe) {
        node.scrollIntoView({ block: "center" })
        const params = new URLSearchParams(window.location.search)
        params.delete("focus")
        const search = params.toString()
        window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname)
      }
      const observer = new IntersectionObserver(([entry]) => setMeInView(entry.isIntersecting), {
        rootMargin: "-56px 0px -64px 0px",
      })
      observer.observe(node)
      return () => observer.disconnect()
    },
    [focusMe, pathname]
  )
  const myRowShown = rows.some((row) => row.isMe) && meInView

  const hrefFor = (target: number) => (target > 1 ? `${pathname}?page=${target}` : pathname)

  const jumpToMe = () => {
    if (!mine) {
      return
    }
    const targetPage = Math.max(1, Math.ceil(mine.position / PAGE_SIZE))
    router.push(`${pathname}?${targetPage > 1 ? `page=${targetPage}&` : ""}focus=me`, { scroll: false })
  }

  const myScore = mine ? scoreFor(Number(mine.time)) : null

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            <Link href="/trials" className="hover:text-foreground">
              Trials
            </Link>
            {retired ? <span className="border border-line-strong px-1.5 text-muted-foreground">Retired</span> : null}
          </span>
        }
        title={trial}
      >
        {/* Phones: record, video, stats. Desktop: record and stats on the
            left, the video large on the right. */}
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]">
          <dl className="m-0">
            <Stat label="World record">
              {records.loading ? (
                <Skeleton className="mt-1 h-10 w-40 rounded-sm bg-surface-3" />
              ) : wr ? (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <span className="num text-[40px] font-semibold leading-none text-gold">{formatTime(wr.time)}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[15px]">
                    <PlayerAvatar
                      size="sm"
                      className="size-6"
                      playerName={wr.player_name}
                      playerUuid={wr.player_uuid}
                      hasRobloxAvatar={wr.has_roblox_avatar}
                      discordId={wr.discord_id}
                      discordAvatar={wr.discord_avatar}
                      discordDiscriminator={wr.discord_discriminator}
                    />
                    <Link href={`/players/${encodeURIComponent(wr.player_uuid)}`} className="truncate font-medium hover:underline">
                      {wr.player_name}
                    </Link>
                    <span className="text-muted-foreground" title={`Set ${formatDate(wr.date)}`}>
                      · standing {formatDays(daysBetween(wr.date, now))}
                    </span>
                  </span>
                </div>
              ) : (
                <p className="text-[15px] text-muted-foreground">No record yet. The first approved run sets it.</p>
              )}
            </Stat>
          </dl>

          {wr ? (
            <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <WrVideo key={wr.submission_uuid} trial={trial} wr={wr} showPoster={showThumbnails} />
            </div>
          ) : null}

          <dl className="m-0 flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-5">
              {mine ? (
                <Stat label="Your PB">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num text-lg font-semibold sm:text-xl">{formatTime(mine.time)}</span>
                    <span className="num text-sm text-muted-foreground">#{mine.rank}</span>
                  </span>
                </Stat>
              ) : null}
              {mine && myScore != null ? (
                <Stat label="Your score">
                  <span className="num text-lg font-semibold sm:text-xl">{formatScore(myScore)}</span>
                </Stat>
              ) : null}
              <Stat label="Platinum">
                <span className="num text-lg font-semibold text-tier-platinum sm:text-xl">{formatTime(plats[trial])}</span>
              </Stat>
              <Stat label="Bronze">
                <span className="num text-lg font-semibold text-bronze sm:text-xl">{formatTime(bronze[trial])}</span>
              </Stat>
              <Stat label="Runners">
                <span className="num text-lg font-semibold sm:text-xl">{board.loading ? "…" : formatCount(total)}</span>
              </Stat>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              A run scores 0 at the bronze time, 0.300 at platinum and 1.000 at the world record.
            </p>
          </dl>
        </div>
      </PageHeader>

      <section className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-10 pt-4" aria-label={`${trial} results`}>
        <nav aria-label={`${trial} sections`} className="flex border-b border-line">
          {(
            [
              { key: "board", label: "Leaderboard", href: pathname },
              { key: "history", label: "WR history", href: `${pathname}?tab=history` },
            ] as const
          ).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              scroll={false}
              aria-current={tab === item.key ? "page" : undefined}
              className={cn(
                "label-caps flex h-11 items-center px-3 text-[16px] transition-colors hover:text-foreground",
                tab === item.key ? "text-foreground shadow-[inset_0_-3px_0_var(--primary)]" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {tab === "board" ? (
          <>
            <div>
              <div className={cn(boardGrid, "label-caps h-9 border-b border-line px-3 text-[13px] text-subtle-foreground")} aria-hidden>
                <span>Pos</span>
                <span>Player</span>
                <span className="text-right md:text-left">Time</span>
                <span className="hidden text-right md:block">Gap</span>
                <span className="hidden text-right md:block">Score</span>
                <span className="hidden md:block md:pl-6">Date</span>
                <span className="hidden md:block" />
              </div>

              {board.loading ? (
                <ol aria-label="Loading leaderboard">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <li key={index} className={cn(boardGrid, "h-14 border-b border-[#1c1c1c] px-3 md:h-12")}>
                      <Skeleton className="h-4 w-6 rounded-sm bg-surface-3" />
                      <span className="flex items-center gap-2.5">
                        <Skeleton className="size-7 rounded-md bg-surface-3" />
                        <Skeleton className="h-4 w-28 rounded-sm bg-surface-3" />
                      </span>
                      <Skeleton className="ml-auto h-4 w-14 rounded-sm bg-surface-3 md:ml-0" />
                    </li>
                  ))}
                </ol>
              ) : board.error && rows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                  <p className="text-[15px] text-muted-foreground">Couldn&apos;t load this leaderboard. {board.error}</p>
                  <Button variant="outline" onClick={board.refetch}>
                    Try again
                  </Button>
                </div>
              ) : rows.length === 0 ? (
                <p className="px-4 py-14 text-center text-[15px] text-muted-foreground">No one has a time on {trial} yet.</p>
              ) : (
                <ol aria-label={`${trial} leaderboard`}>
                  {rows.map((row, index) => (
                    <li
                      key={row.player_uuid}
                      ref={row.isMe ? myRowRef : undefined}
                      className={cn(
                        boardGrid,
                        "relative h-14 border-b border-[#1c1c1c] px-3 transition-colors hover:bg-surface-3 md:h-12",
                        row.isMe ? "bg-primary/10 hover:bg-primary/15" : index % 2 === 1 && "bg-surface"
                      )}
                    >
                      <RankCell rank={row.rank} />
                      <span className="flex min-w-0 items-center gap-2.5">
                        <PlayerAvatar
                          size="sm"
                          className="size-7"
                          playerName={row.player_name}
                          playerUuid={row.player_uuid}
                          hasRobloxAvatar={row.has_roblox_avatar}
                          discordId={row.discord_id}
                          discordAvatar={row.discord_avatar}
                          discordDiscriminator={row.discord_discriminator}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <Link
                              href={`/players/${encodeURIComponent(row.player_uuid)}`}
                              className="relative z-10 truncate text-[15px] font-medium hover:underline"
                            >
                              {row.player_name}
                            </Link>
                            {row.isMe ? <span className="label-caps shrink-0 bg-primary px-1.5 text-[12px] text-primary-foreground">You</span> : null}
                          </span>
                          <span className="text-[12px] text-subtle-foreground md:hidden">{formatDate(row.date)}</span>
                        </span>
                      </span>
                      <span className="flex flex-col items-end md:items-start">
                        <Link
                          href={`/submissions/${encodeURIComponent(row.submission_uuid)}`}
                          aria-label={`${formatTime(row.time)}, watch ${row.player_name}'s run`}
                          className={cn("num text-base font-semibold after:absolute after:inset-0", row.gap === 0 && "text-gold")}
                        >
                          {formatTime(row.time)}
                        </Link>
                        <span className="num text-[12px] text-subtle-foreground md:hidden">
                          {row.gap === 0 ? "WR" : row.gap != null ? formatDelta(row.gap) : ""}
                        </span>
                      </span>
                      <span className="hidden text-right md:block">
                        {row.gap === 0 ? (
                          <span className="label-caps text-[13px] text-gold">WR</span>
                        ) : (
                          <span className="num text-[13px] text-subtle-foreground">{row.gap != null ? formatDelta(row.gap) : "—"}</span>
                        )}
                      </span>
                      <span className="num hidden text-right text-sm md:block">{row.score != null ? formatScore(row.score) : "—"}</span>
                      <span className="hidden text-sm text-muted-foreground md:block md:pl-6">{formatDate(row.date)}</span>
                      <span className="hidden justify-end text-subtle-foreground md:flex" aria-hidden>
                        <PlayIcon className="size-4" />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Pager page={page} totalPages={totalPages} hrefFor={hrefFor} className="pt-3" />

            {mine && !myRowShown ? (
              <aside
                aria-label="Your position"
                className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-x-3 rounded-lg border border-primary bg-surface-2 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] sm:flex-wrap sm:gap-x-5 sm:gap-y-2 sm:px-4 sm:py-3 md:bottom-4"
              >
                <span className="num w-9 shrink-0 text-[15px] text-muted-foreground sm:w-10">{mine.rank}</span>
                <span className="flex min-w-0 flex-1 basis-0 items-center gap-2.5 sm:basis-32">
                  <span className="truncate text-[15px] font-semibold">{user?.player_name}</span>
                  <span className="label-caps shrink-0 bg-primary px-1.5 text-[12px] text-primary-foreground">You</span>
                </span>
                <span className="num text-base font-semibold">{formatTime(mine.time)}</span>
                {wrTime ? <span className="num hidden text-sm text-muted-foreground sm:inline">{formatDelta(Number(mine.time) - wrTime)}</span> : null}
                <Button variant="outline" size="sm" onClick={jumpToMe} aria-label="Jump to me" className="max-sm:size-8 max-sm:px-0">
                  <LocateFixedIcon className="size-4" />
                  <span className="max-sm:hidden">Jump to me</span>
                </Button>
              </aside>
            ) : null}
          </>
        ) : (
          <div>
            <div className={cn(historyGrid, "label-caps h-9 border-b border-line px-3 text-[13px] text-subtle-foreground")} aria-hidden>
              <span className="hidden md:block">Date</span>
              <span className="hidden md:block">Time</span>
              <span>Holder</span>
              <span className="text-right md:hidden">Time</span>
              <span className="hidden text-right md:block">Improved by</span>
              <span className="hidden text-right md:block">Stood</span>
            </div>
            {history.loading ? (
              <ol aria-label="Loading record history">
                {Array.from({ length: 6 }).map((_, index) => (
                  <li key={index} className="flex h-14 items-center gap-4 border-b border-[#1c1c1c] px-3">
                    <Skeleton className="h-4 w-24 rounded-sm bg-surface-3" />
                    <Skeleton className="h-4 w-16 rounded-sm bg-surface-3" />
                    <Skeleton className="h-4 w-32 rounded-sm bg-surface-3" />
                  </li>
                ))}
              </ol>
            ) : history.error && historyRows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                <p className="text-[15px] text-muted-foreground">Couldn&apos;t load the record history. {history.error}</p>
                <Button variant="outline" onClick={history.refetch}>
                  Try again
                </Button>
              </div>
            ) : historyRows.length === 0 ? (
              <p className="px-4 py-14 text-center text-[15px] text-muted-foreground">No world records on {trial} yet.</p>
            ) : (
              <ol aria-label={`${trial} world record history, newest first`}>
                {historyRows.map((row, index) => (
                  <li
                    key={row.uuid}
                    className={cn(
                      historyGrid,
                      "relative min-h-14 border-b border-[#1c1c1c] px-3 py-2 transition-colors hover:bg-surface-3",
                      index % 2 === 1 && "bg-surface"
                    )}
                  >
                    <span className="hidden text-sm text-muted-foreground md:block">{formatDate(row.date)}</span>
                    <span className="hidden md:block">
                      <Link
                        href={`/submissions/${encodeURIComponent(row.uuid)}`}
                        aria-label={`${formatTime(row.time)} by ${row.player_name}, watch the run`}
                        className={cn("num text-base font-semibold after:absolute after:inset-0", row.current && "text-gold")}
                      >
                        {formatTime(row.time)}
                      </Link>
                    </span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <PlayerAvatar
                        size="sm"
                        className="size-7"
                        playerName={row.player_name}
                        playerUuid={row.player_uuid}
                        hasRobloxAvatar={row.has_roblox_avatar}
                        discordId={row.discord_id}
                        discordAvatar={row.discord_avatar}
                        discordDiscriminator={row.discord_discriminator}
                      />
                      <span className="flex min-w-0 flex-col">
                        <Link href={`/players/${encodeURIComponent(row.player_uuid)}`} className="relative z-10 truncate text-[15px] font-medium hover:underline">
                          {row.player_name}
                        </Link>
                        <span className="text-[12px] text-subtle-foreground md:hidden">
                          {formatDate(row.date)}
                          {row.current ? " · current" : ` · stood ${formatAge(row.date, row.date + row.stoodDays * 86400)}`}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-col items-end md:hidden">
                      <Link
                        href={`/submissions/${encodeURIComponent(row.uuid)}`}
                        aria-label={`${formatTime(row.time)} by ${row.player_name}, watch the run`}
                        className={cn("num text-base font-semibold after:absolute after:inset-0", row.current && "text-gold")}
                      >
                        {formatTime(row.time)}
                      </Link>
                      <span className="num text-[12px] text-subtle-foreground">
                        {row.improvement != null ? formatDelta(row.improvement) : "First"}
                      </span>
                    </span>
                    <span className="num hidden text-right text-[13px] text-subtle-foreground md:block">
                      {row.improvement != null ? formatDelta(row.improvement) : <span className="label-caps">First</span>}
                    </span>
                    <span className="hidden text-right text-sm md:block">
                      {row.current ? (
                        <span className="label-caps text-[13px] text-gold">Current</span>
                      ) : (
                        <span className="text-muted-foreground">{formatDays(row.stoodDays)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    </>
  )
}
