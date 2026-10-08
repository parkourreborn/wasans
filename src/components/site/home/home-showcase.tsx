"use client"

import Link from "next/link"
import { PlayIcon } from "lucide-react"
import { formatCount, formatDelta, formatRelative, formatScore, formatTime } from "@/lib/format"
import { tierForScore } from "@/lib/tiers"
import { cn } from "@/lib/utils"
import { useNow } from "@/hooks/use-now"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { runPosterUrl } from "@/components/site/run-video"
import { TierLabel } from "@/components/site/tier-label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  thisWeek,
  useApprovedRunCount,
  useRecordTimeline,
  useTopPlayers,
  useUpForGrabs,
  type RecordBreak,
  type TopPlayer,
} from "@/components/site/home/home-data"
import { GiveawayCard, playerHref, PrizeTeaser, RecordClip, runHref, SectionHead, TopPlayerRows } from "@/components/site/home/home-parts"

const steps = [
  { title: "Run a trial", body: "Record it with the timer, your username and the build number in view." },
  { title: "Submit the clip", body: "Drop the video on the Submit page. A moderator checks every run." },
  { title: "Get a score", body: "Your PBs are measured against the WRs and averaged. Platinum starts at 0.300." },
]

// The signed-out homepage: what the site is, the leaderboard's top three
// beside the newest world record, then the week's records and the board.
export function HomeShowcase() {
  const now = useNow()
  const { breaks, loading: recordsLoading } = useRecordTimeline()
  const { players, total, loading: playersLoading } = useTopPlayers(8)
  const approved = useApprovedRunCount()
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const { giveaway, prize } = useUpForGrabs()
  const recent = thisWeek(breaks, now)
  const shown = recent.length > 0 ? recent.slice(0, 4) : breaks.slice(0, 4)

  const stats = [
    { label: "Players", value: total },
    { label: "Runs approved", value: approved },
    { label: "Trials", value: orderedTrialNames.filter((trial) => !removedTrials.has(trial)).length },
    { label: "WRs this week", value: recordsLoading ? null : recent.length, gold: true },
  ]

  return (
    <>
      <section className="border-b border-line bg-[#0b0b0b]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-end justify-between gap-x-10 gap-y-5 px-4 pb-7 pt-10 md:pt-12">
          <h1 className="font-display text-[88px] font-extrabold uppercase leading-[0.85] tracking-[0.01em] sm:text-[120px] md:text-[140px]">Wasans</h1>
          <div className="flex max-w-[420px] flex-col gap-4 md:pb-3">
            <p className="text-[17px] leading-relaxed text-muted-foreground">
              The Parkour Reborn time trial leaderboard. World records, PBs and a score for every player, with every run checked by a moderator.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button asChild size="lg" className="h-12 px-5 text-[17px]">
                <Link href="/submit">Submit a run</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-5 text-[17px]">
                <Link href="/leaderboard">Full leaderboard</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1200px] gap-4 px-4 pb-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Podium players={players} loading={playersLoading} />
          <RecordClip record={breaks[0] ?? null} now={now} />
        </div>

        <div className="mx-auto max-w-[1200px] px-4 pb-10">
          <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse gap-1 bg-surface px-4 py-4">
                <dt className="label-caps text-[13px] text-subtle-foreground">{stat.label}</dt>
                <dd className={cn("num m-0 text-[30px] font-semibold leading-none", stat.gold && "text-gold")}>
                  {stat.value == null ? <Skeleton className="h-7 w-20 bg-surface-3" /> : formatCount(stat.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pb-16 pt-11">
        <section aria-labelledby="home-records" className="flex flex-col gap-4">
          <SectionHead
            id="home-records"
            title={recent.length > 0 || recordsLoading ? "Broken this week" : "Latest records"}
            href="/trials"
            linkLabel="All world records"
          />
          {recordsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-64 w-full bg-surface" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No world records yet.</p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {shown.map((entry) => (
                <RecordCard key={entry.uuid} entry={entry} now={now} />
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="home-board" className="flex min-w-0 flex-col">
            <SectionHead id="home-board" title="Leaderboard" href="/leaderboard" linkLabel="Full leaderboard" />
            <TopPlayerRows players={players} loading={playersLoading} count={8} wide />
          </section>

          <aside className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="home-how" className="flex flex-col gap-3.5">
              <SectionHead id="home-how" title="How it works" />
              <ol className="m-0 flex list-none flex-col gap-px overflow-hidden rounded-md border border-line bg-line p-0">
                {steps.map((step, index) => (
                  <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2.5 bg-surface px-4 py-3.5">
                    <span className="font-display text-[30px] font-extrabold leading-[0.9] text-primary">{index + 1}</span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{step.title}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <Link href="/information" className="label-caps w-fit text-[13px] text-muted-foreground hover:text-foreground">
                How scoring works
              </Link>
            </section>
            {giveaway ? <GiveawayCard giveaway={giveaway} now={now} /> : prize ? <PrizeTeaser prize={prize} now={now} /> : null}
          </aside>
        </div>
      </div>
    </>
  )
}

function Podium({ players, loading }: { players: TopPlayer[]; loading: boolean }) {
  if (loading) {
    return <Skeleton className="min-h-64 w-full rounded-md bg-surface" />
  }
  const [first, ...rest] = players
  if (!first) {
    return <div className="rounded-md border border-line bg-surface" />
  }
  const colors = ["text-silver", "text-bronze"]
  return (
    <ol aria-label="Top three players" className="m-0 flex list-none flex-col gap-px overflow-hidden rounded-md border border-line bg-line p-0">
      <li className="relative flex flex-1 flex-col justify-center gap-1.5 bg-surface px-5 py-5 transition-colors hover:bg-surface-2">
        <span className="flex items-center gap-2">
          <span className="label-caps text-[13px] text-gold">#1</span>
          <TierLabel tier={tierForScore(Number(first.score))} className="text-[13px]" />
        </span>
        <Link href={playerHref(first.uuid)} className="truncate font-display text-[52px] font-extrabold uppercase leading-[0.9] after:absolute after:inset-0">
          {first.player_name}
        </Link>
        <span className="num text-[26px] font-semibold">{formatScore(first.score)}</span>
      </li>
      {rest.slice(0, 2).map((player, index) => (
        <li key={player.uuid} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-2.5 bg-surface px-5 py-3.5 transition-colors hover:bg-surface-2">
          <span className={cn("num font-semibold", colors[index])}>#{index + 2}</span>
          <Link href={playerHref(player.uuid)} className="truncate font-display text-[26px] font-extrabold uppercase leading-none after:absolute after:inset-0">
            {player.player_name}
          </Link>
          <span className="num">{formatScore(player.score)}</span>
        </li>
      ))}
    </ol>
  )
}

function RecordCard({ entry, now }: { entry: RecordBreak; now: number }) {
  return (
    <li className="relative flex flex-col gap-2.5 rounded-md border border-line-strong bg-surface p-3.5 transition-colors hover:border-[#5a5a5a]">
      <div className="relative aspect-video overflow-hidden rounded-sm bg-surface-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- previews come straight from the assets bucket */}
        <img
          src={runPosterUrl(entry.uuid)}
          alt=""
          loading="lazy"
          // A missing preview (video still processing or failed) leaves the plain tile.
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden"
          }}
          className="size-full object-cover"
        />
        <PlayIcon className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 fill-foreground/80 text-foreground/80" aria-hidden />
      </div>
      <Link href={runHref(entry.uuid)} className="font-display text-[26px] font-extrabold uppercase leading-[0.9] after:absolute after:inset-0">
        {entry.trial_name}
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[18px] font-semibold text-gold">{formatTime(entry.time)}</span>
        <span className="num text-[13px] text-success">{entry.previous ? formatDelta(entry.time - entry.previous.time) : "First"}</span>
      </div>
      <span className="truncate text-sm text-muted-foreground">
        {entry.player_name} · {formatRelative(entry.date, now)}
      </span>
    </li>
  )
}
