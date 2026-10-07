"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LocateFixedIcon, SearchIcon, XIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDelta, formatScore } from "@/lib/format"
import { nextTier, tierForScore, type Tier } from "@/lib/tiers"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PageHeader } from "@/components/site/page-header"
import { Pager } from "@/components/site/pager"
import { RankCell } from "@/components/site/rank-cell"
import { TierLabel } from "@/components/site/tier-label"
import { TierLadder } from "@/components/site/tier-ladder"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 50

type ApiPlayer = {
  uuid: string
  player_name: string
  score: number
  rank?: number
  position?: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

type PlayersResponse = { data?: ApiPlayer[]; meta?: { total?: number } }
type WorldRecordsResponse = { data?: Array<{ player_uuid: string }> }
type PlayerDetailResponse = {
  data?: { player: { uuid: string; player_name: string; score: number; rank: number; position?: number } | null }
}

type Row = ApiPlayer & {
  rank: number
  position: number
  tier: Tier
  wrs: number
  gap: number | "leader" | null
  isMe: boolean
}

// Desktop: Pos | Player | Tier | WRs | Gap | Score. Phones keep Pos, Player
// (with the tier under the name) and Score.
const gridClass =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_5.5rem] md:grid-cols-[4rem_minmax(0,1fr)_7.5rem_4rem_6rem_7rem] items-center"

function pageFrom(value: string | null) {
  const page = Math.floor(Number(value))
  return Number.isFinite(page) && page > 1 ? page : 1
}

export function Leaderboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const page = pageFrom(searchParams.get("page"))
  const urlQuery = searchParams.get("q") ?? ""
  const query = urlQuery.trim()
  const focusMe = searchParams.get("focus") === "me"
  const { user } = useAuthSession()

  // The search box writes into ?q= after a pause, via history.replaceState:
  // the URL stays shareable and survives going back from a profile, without
  // a navigation per keystroke. If the URL changes underneath (the nav link
  // clears it), the box follows.
  const [draft, setDraft] = useState(urlQuery)
  const [syncedQuery, setSyncedQuery] = useState(urlQuery)
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery)
    setDraft(urlQuery)
  }

  useEffect(() => {
    if (draft === urlQuery) {
      return
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      params.delete("page")
      params.delete("focus")
      if (draft.trim()) {
        params.set("q", draft)
      } else {
        params.delete("q")
      }
      const search = params.toString()
      window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft, urlQuery, pathname])

  const listUrl = query
    ? `${apiV2("/players")}?search=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&page=${page}`
    : `${apiV2("/players")}?page=${page}&limit=${PAGE_SIZE}`
  const list = useApi<PlayersResponse>(listUrl)
  // The player just above this page, so its first row can show a gap too.
  const above = useApi<PlayersResponse>(!query && page > 1 ? `${apiV2("/players")}?page=${(page - 1) * PAGE_SIZE}&limit=1` : null)
  const records = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const me = useApi<PlayerDetailResponse>(user ? apiV2(`/players/${encodeURIComponent(user.uuid)}`) : null)
  const meDetail = me.data?.data?.player ?? null

  const wrCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of records.data?.data ?? []) {
      counts.set(record.player_uuid, (counts.get(record.player_uuid) ?? 0) + 1)
    }
    return counts
  }, [records.data])

  const rows = useMemo<Row[]>(() => {
    const players = list.data?.data ?? []
    return players.map((player, index) => {
      const position = player.position ?? (page - 1) * PAGE_SIZE + index + 1
      const previous = index > 0 ? players[index - 1] : above.data?.data?.[0]
      return {
        ...player,
        position,
        rank: player.rank ?? position,
        tier: tierForScore(Number(player.score)),
        wrs: wrCounts.get(player.uuid) ?? 0,
        gap: query ? null : position === 1 ? "leader" : previous ? Number(previous.score) - Number(player.score) : null,
        isMe: player.uuid === user?.uuid,
      }
    })
  }, [list.data, above.data, wrCounts, page, query, user?.uuid])

  const total = list.data?.meta?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // The "you" bar hides while your own row is on screen.
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

  const jumpToMe = () => {
    if (!meDetail) {
      return
    }
    const targetPage = Math.max(1, Math.ceil((meDetail.position ?? meDetail.rank) / PAGE_SIZE))
    router.push(`${pathname}?${targetPage > 1 ? `page=${targetPage}&` : ""}focus=me`, { scroll: false })
  }

  const hrefFor = (target: number) => {
    const params = new URLSearchParams()
    if (query) params.set("q", urlQuery)
    if (target > 1) params.set("page", String(target))
    const search = params.toString()
    return search ? `${pathname}?${search}` : pathname
  }

  const myScore = meDetail ? Number(meDetail.score) : user ? Number(user.score) : null
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(total, page * PAGE_SIZE)

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description={
          <>
            Ranked by Wasans score, the average of your best score on every trial.{" "}
            <Link href="/information" className="text-foreground underline decoration-primary underline-offset-[3px]">
              How scoring works
            </Link>
          </>
        }
      >
        <TierLadder score={myScore} />
      </PageHeader>

      <section className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-10 pt-6" aria-label="Leaderboard">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex h-10 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3 text-subtle-foreground transition-colors focus-within:border-primary sm:w-80">
            <SearchIcon className="size-4 shrink-0" aria-hidden />
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Find a player"
              aria-label="Find a player on the leaderboard"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {draft ? (
              <button
                type="button"
                onClick={() => setDraft("")}
                className="-mr-1 flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-surface-3 hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </label>
          <p className="label-caps text-[15px] text-subtle-foreground" aria-live="polite">
            {list.loading
              ? " "
              : query
                ? `${formatCount(total)} ${total === 1 ? "match" : "matches"}`
                : total > 0
                  ? `Ranks ${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}`
                  : ""}
          </p>
        </div>

        <div className="border-t border-line">
          <div className={cn(gridClass, "label-caps h-9 border-b border-line px-3 text-[13px] text-subtle-foreground")} aria-hidden>
            <span>Pos</span>
            <span>Player</span>
            <span className="hidden md:block">Tier</span>
            <span className="hidden md:block">WRs</span>
            <span className="hidden text-right md:block">Gap</span>
            <span className="text-right">Score</span>
          </div>

          {list.loading ? (
            <ol aria-label="Loading leaderboard">
              {Array.from({ length: 12 }).map((_, index) => (
                <li key={index} className={cn(gridClass, "h-12 border-b border-[#1c1c1c] px-3")}>
                  <Skeleton className="h-4 w-6 rounded-sm bg-surface-3" />
                  <span className="flex items-center gap-2.5">
                    <Skeleton className="size-7 rounded-md bg-surface-3" />
                    <Skeleton className="h-4 w-32 rounded-sm bg-surface-3" />
                  </span>
                  <Skeleton className="hidden h-4 w-16 rounded-sm bg-surface-3 md:block" />
                  <Skeleton className="hidden h-4 w-5 rounded-sm bg-surface-3 md:block" />
                  <Skeleton className="ml-auto hidden h-4 w-12 rounded-sm bg-surface-3 md:block" />
                  <Skeleton className="ml-auto h-4 w-14 rounded-sm bg-surface-3" />
                </li>
              ))}
            </ol>
          ) : list.error && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <p className="text-[15px] text-muted-foreground">Couldn&apos;t load the leaderboard. {list.error}</p>
              <Button variant="outline" onClick={list.refetch}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-14 text-center text-[15px] text-muted-foreground">
              {query ? <>No players match &ldquo;{query}&rdquo;.</> : "No ranked players yet."}
            </p>
          ) : (
            <ol aria-label={query ? `Players matching ${query}` : `Ranks ${first} to ${last}`}>
              {rows.map((row, index) => (
                <li
                  key={row.uuid}
                  ref={row.isMe ? myRowRef : undefined}
                  className={cn(
                    gridClass,
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
                      playerUuid={row.uuid}
                      hasRobloxAvatar={row.has_roblox_avatar}
                      discordId={row.discord_id}
                      discordAvatar={row.discord_avatar}
                      discordDiscriminator={row.discord_discriminator}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`/players/${encodeURIComponent(row.uuid)}`}
                          className="truncate text-[15px] font-medium after:absolute after:inset-0 hover:text-foreground"
                        >
                          {row.player_name}
                        </Link>
                        {row.isMe ? <span className="label-caps shrink-0 bg-primary px-1.5 text-[12px] text-primary-foreground">You</span> : null}
                      </span>
                      <TierLabel tier={row.tier} className="text-[13px] leading-tight md:hidden" />
                    </span>
                  </span>
                  <TierLabel tier={row.tier} className="hidden md:block" />
                  <span className={cn("num hidden text-sm md:block", row.wrs > 0 ? "text-gold" : "text-[#5a5a5a]")}>
                    {row.wrs > 0 ? row.wrs : "—"}
                  </span>
                  <span className="hidden text-right md:block">
                    {row.gap === "leader" ? (
                      <span className="label-caps text-[13px] text-subtle-foreground">Leader</span>
                    ) : row.gap == null ? (
                      <span className="num text-[13px] text-[#5a5a5a]">—</span>
                    ) : (
                      <span className="num text-[13px] text-subtle-foreground">{formatDelta(row.gap)}</span>
                    )}
                  </span>
                  <span className="num text-right text-base font-semibold">{formatScore(row.score)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <Pager page={page} totalPages={totalPages} hrefFor={hrefFor} className="pt-3" />

        {meDetail && !myRowShown ? (
          <YouBar
            rank={meDetail.rank}
            name={meDetail.player_name}
            score={Number(meDetail.score)}
            user={user}
            onJump={jumpToMe}
          />
        ) : null}
      </section>
    </>
  )
}

function YouBar({
  rank,
  name,
  score,
  user,
  onJump,
}: {
  rank: number
  name: string
  score: number
  user: ReturnType<typeof useAuthSession>["user"]
  onJump: () => void
}) {
  const tier = tierForScore(score)
  const next = nextTier(score)

  return (
    <aside
      aria-label="Your position"
      className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-x-3 rounded-lg border border-primary bg-surface-2 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] sm:flex-wrap sm:gap-x-5 sm:gap-y-2 sm:px-4 sm:py-3 md:bottom-4"
    >
      <span className="num w-9 shrink-0 text-[15px] text-muted-foreground sm:w-10">{rank}</span>
      <span className="flex min-w-0 flex-1 basis-0 items-center gap-2.5 sm:basis-40">
        {user ? (
          <PlayerAvatar
            size="sm"
            className="size-7"
            playerName={user.player_name}
            playerUuid={user.uuid}
            hasRobloxAvatar={user.has_roblox_avatar}
            discordId={user.discord_id}
            discordAvatar={user.discord_avatar}
            discordDiscriminator={user.discord_discriminator}
          />
        ) : null}
        <span className="truncate text-[15px] font-semibold">{name}</span>
        <span className="label-caps shrink-0 bg-primary px-1.5 text-[12px] text-primary-foreground">You</span>
      </span>
      <span className="hidden items-center gap-3 sm:flex">
        <TierLabel tier={tier} />
        <span className="text-sm text-muted-foreground">
          {next ? (
            <>
              <span className="num text-foreground">{next.needed.toFixed(3)}</span> to {next.tier.name}
            </>
          ) : (
            "Top tier"
          )}
        </span>
      </span>
      <span className="num text-base font-semibold">{formatScore(score)}</span>
      <Button variant="outline" size="sm" onClick={onJump} aria-label="Jump to me" className="max-sm:size-8 max-sm:px-0">
        <LocateFixedIcon className="size-4" />
        <span className="max-sm:hidden">Jump to me</span>
      </Button>
    </aside>
  )
}
