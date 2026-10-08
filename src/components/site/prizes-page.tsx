"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckIcon, FlameIcon, GiftIcon, TargetIcon, TrendingUpIcon, TrophyIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import {
  CRITERIA_LABELS,
  fetchGiveaways,
  fetchPrizes,
  formatDeadline,
  formatUntil,
  howToWin,
  spotsLabel,
  type Giveaway,
  type Prize,
  type PrizeCriteriaType,
  type PrizeFilter,
  type PrizeStatus,
  type PrizeWinner,
} from "@/lib/prizes"
import { cn } from "@/lib/utils"
import { useComboCategories } from "@/hooks/use-combo-categories"
import { useNow } from "@/hooks/use-now"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useLoginDialog } from "@/components/site/login-dialog"
import { PageHeader } from "@/components/site/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// The nav's "new prize" dot (see use-nav-badges.ts) goes away once the
// newest active prize or giveaway has been seen here.
const lastSeenPrizeStorageKey = "wasans:last-seen-prize-at"

const CRITERIA_ICONS: Record<PrizeCriteriaType, typeof TrophyIcon> = {
  trial_wr: TrophyIcon,
  combo_wr: FlameIcon,
  rankup: TrendingUpIcon,
  score_reached: TargetIcon,
}

type Board = { filter: PrizeFilter; prizes: Prize[]; giveaways: Giveaway[] }

export function PrizesPage() {
  const { user } = useAuthSession()
  const { openLogin } = useLoginDialog()
  const { categories } = useComboCategories()
  const now = useNow()
  const [filter, setFilter] = useState<PrizeFilter>("active")
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [joining, setJoining] = useState<string | null>(null)
  const viewer = user?.uuid ?? null

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPrizes(filter), fetchGiveaways(filter)])
      .then(([prizes, giveaways]) => {
        if (cancelled) return
        setBoard({ filter, prizes, giveaways })
        setError(null)
        if (filter === "active") {
          const newest = Math.max(0, ...prizes.map((item) => item.created_at), ...giveaways.map((item) => item.created_at))
          if (newest > 0) {
            try {
              window.localStorage.setItem(lastSeenPrizeStorageKey, String(newest))
              window.dispatchEvent(new CustomEvent("wasans:last-seen-prize-updated"))
            } catch {
              // Storage can be blocked; the dot just stays.
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load prizes.")
      })
    return () => {
      cancelled = true
    }
    // The viewer is a dependency so "You're in" reflects who's logged in.
  }, [filter, attempt, viewer])

  const current = board && board.filter === filter ? board : null
  const categoryLabel = (slug: string) => categories.find((category) => category.slug === slug)?.label

  const join = async (giveaway: Giveaway) => {
    if (!user) {
      openLogin("Log in to join the giveaway.")
      return
    }
    setJoining(giveaway.uuid)
    try {
      const response = await fetch(apiV2(`/giveaways/${giveaway.uuid}/join`), { method: "POST" })
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(json?.error?.message || "Couldn't join the giveaway. Try again.")
      toast.success(`You're in the ${giveaway.title} giveaway.`)
      setBoard((value) =>
        value
          ? {
              ...value,
              giveaways: value.giveaways.map((item) =>
                item.uuid === giveaway.uuid ? { ...item, viewer_has_joined: true, entry_count: item.entry_count + 1 } : item
              ),
            }
          : value
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join the giveaway. Try again.")
    } finally {
      setJoining(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Prizes"
        description="Win prizes by setting records and ranking up, and join giveaways for a chance at more."
        actions={
          (user?.permission ?? 0) >= 4 ? (
            <Button asChild variant="outline">
              <Link href="/admin/prizes">Manage prizes</Link>
            </Button>
          ) : null
        }
      >
        <div role="tablist" aria-label="Which prizes" className="flex gap-1">
          {(
            [
              { key: "active", label: "Running now" },
              { key: "history", label: "Past" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === filter}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "label-caps flex h-10 items-center rounded-md border px-4 text-[15px] transition-colors",
                tab.key === filter
                  ? "border-foreground bg-foreground text-background"
                  : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pb-16 pt-8">
        {error && !current ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <p className="m-0">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : null}

        <BoardSection
          title="Giveaways"
          description="Join before the deadline. Winners are drawn at random."
          count={current?.giveaways.length}
          loading={!current && !error}
          empty={filter === "active" ? "No giveaways running right now. Check back soon." : "No past giveaways yet."}
        >
          {current?.giveaways.map((giveaway) => (
            <PrizeCard
              key={giveaway.uuid}
              kind="Giveaway"
              icon={GiftIcon}
              title={giveaway.title}
              description={giveaway.description}
              howTo={`Join below. ${giveaway.max_winners} ${giveaway.max_winners === 1 ? "winner is" : "winners are"} drawn at random when it ends.`}
              status={giveaway.status}
              endsAt={giveaway.ends_at}
              now={now}
              winners={giveaway.winners}
              spots={giveaway.status === "active" ? null : spotsLabel(giveaway.winners.length, giveaway.max_winners)}
              footer={
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    <span className="num text-foreground">{giveaway.entry_count}</span> {giveaway.entry_count === 1 ? "player" : "players"} in
                  </span>
                  {giveaway.status !== "active" ? null : giveaway.viewer_has_joined ? (
                    <span className="label-caps flex h-9 items-center gap-1.5 text-[14px] text-success">
                      <CheckIcon className="size-4" aria-hidden />
                      You&apos;re in
                    </span>
                  ) : (
                    <Button onClick={() => void join(giveaway)} disabled={joining === giveaway.uuid}>
                      {joining === giveaway.uuid ? <Spinner className="size-4" /> : <GiftIcon />}
                      Join giveaway
                    </Button>
                  )}
                </div>
              }
            />
          ))}
        </BoardSection>

        <BoardSection
          title="Prizes"
          description="Hit the goal and it's yours. Staff confirm each winner before it's official."
          count={current?.prizes.length}
          loading={!current && !error}
          empty={filter === "active" ? "No prizes up for grabs right now." : "No past prizes yet."}
        >
          {current?.prizes.map((prize) => (
            <PrizeCard
              key={prize.uuid}
              kind={CRITERIA_LABELS[prize.criteria_type]}
              icon={CRITERIA_ICONS[prize.criteria_type]}
              title={prize.title}
              description={prize.description}
              howTo={howToWin(prize, categoryLabel)}
              status={prize.status}
              endsAt={prize.ends_at}
              now={now}
              winners={prize.winners}
              spots={spotsLabel(prize.winners.length, prize.max_winners)}
            />
          ))}
        </BoardSection>
      </div>
    </>
  )
}

function BoardSection({
  title,
  description,
  count,
  loading,
  empty,
  children,
}: {
  title: string
  description: string
  count?: number
  loading: boolean
  empty: string
  children: React.ReactNode
}) {
  const id = `${title.toLowerCase()}-title`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1 border-b border-line pb-3">
        <h2 id={id} className="flex items-baseline gap-2.5 font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          {title}
          {count ? <span className="num text-[16px] font-medium text-subtle-foreground">{count}</span> : null}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-64 w-full bg-surface" />
          <Skeleton className="hidden h-64 w-full bg-surface md:block" />
        </div>
      ) : count ? (
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      ) : (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-10 text-center text-[15px] text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

function Deadline({ status, endsAt, now }: { status: PrizeStatus; endsAt: number | null; now: number }) {
  if (status === "won") {
    return <span className="label-caps text-[13px] text-gold">Won</span>
  }
  if (status === "closed") {
    return (
      <span className="label-caps text-[13px] text-subtle-foreground" title={endsAt ? formatDeadline(endsAt) : undefined}>
        Ended
      </span>
    )
  }
  if (!endsAt) {
    return <span className="label-caps text-[13px] text-subtle-foreground">No deadline</span>
  }
  const soon = endsAt - now < 86400
  return (
    <span className={cn("text-[13px]", soon ? "text-primary" : "text-muted-foreground")} title={formatDeadline(endsAt)}>
      <span className="label-caps">Ends</span> <span className="num">{formatUntil(endsAt, now)}</span>
    </span>
  )
}

function PrizeCard({
  kind,
  icon: Icon,
  title,
  description,
  howTo,
  status,
  endsAt,
  now,
  winners,
  spots,
  footer,
}: {
  kind: string
  icon: typeof TrophyIcon
  title: string
  description: string | null
  howTo: string
  status: PrizeStatus
  endsAt: number | null
  now: number
  winners: PrizeWinner[]
  spots: string | null
  footer?: React.ReactNode
}) {
  return (
    <article className={cn("flex flex-col rounded-md border bg-surface", status === "active" ? "border-line-strong" : "border-line")}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="label-caps flex items-center gap-1.5 text-[13px] text-primary">
          <Icon className="size-3.5" aria-hidden />
          {kind}
        </span>
        <Deadline status={status} endsAt={endsAt} now={now} />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-[26px] font-extrabold uppercase leading-[0.95] break-words">{title}</h3>
          {description ? <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-col gap-1 border-l-2 border-primary bg-surface-2 px-3 py-2.5">
          <span className="label-caps text-[12px] text-subtle-foreground">How to win</span>
          <p className="text-[15px]">{howTo}</p>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label-caps text-[13px] text-subtle-foreground">Winners</span>
            {spots ? <span className="num text-[13px] text-muted-foreground">{spots}</span> : null}
          </div>
          {winners.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {winners.map((winner) => (
                <li key={winner.uuid}>
                  <Link
                    href={`/players/${encodeURIComponent(winner.player_uuid)}`}
                    className="flex h-8 items-center rounded-sm border border-line-strong px-2.5 text-[14px] transition-colors hover:border-primary"
                  >
                    {winner.player_name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle-foreground">{status === "active" ? "Nobody yet. Could be you." : "Nobody won this one."}</p>
          )}
        </div>
      </div>
      {footer}
    </article>
  )
}
