"use client"

import Link from "next/link"
import { apiV2 } from "@/lib/api"
import type { AuthSessionUser } from "@/lib/auth-session"
import calculateScore from "@/lib/calc-score"
import { formatCount, formatRelative, formatScore, formatTime } from "@/lib/format"
import { countedTrials } from "@/lib/score-estimate"
import { nextTier, tierForScore } from "@/lib/tiers"
import { trialHref } from "@/lib/trial-slug"
import { plats, type TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useNow } from "@/hooks/use-now"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { normalizeRunState, StatusBadge } from "@/components/site/status-badge"
import { TierLabel } from "@/components/site/tier-label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  thisWeek,
  useRecordTimeline,
  useTopPlayers,
  useUpForGrabs,
  useWorldRecords,
} from "@/components/site/home/home-data"
import { GiveawayCard, PrizeTeaser, RecordRows, runHref, SectionHead, TopPlayerRows } from "@/components/site/home/home-parts"

type Pb = { trial_name: string; time: number; submission_uuid: string }
type RecentRun = { uuid: string; trial_name: string; time: number; date: number; state: string }
type PlayerResponse = {
  data?: { player?: { score?: number; rank?: number; pbs?: Pb[]; recent_submissions?: RecentRun[] } | null }
}
type CountResponse = { meta?: { count?: number } }

// How much faster than a PB the targets assume.
const TARGET_CUT = 0.02

type Target = { trial: string; from: number | null; goal: number; gain: number }

// Where a little time is worth the most score: 2% off each PB, or
// platinum on a trial with no time yet (worth 0 until then).
function bestTargets(pbs: Pb[], records: Array<{ trial_name: string; time: number }>, openTrials: string[], score: number): Target[] {
  const wrs = new Map(records.map((record) => [record.trial_name, Number(record.time)]))
  const mine = new Map(pbs.map((pb) => [pb.trial_name, Number(pb.time)]))
  const count = countedTrials(pbs, records, score)
  const trialScore = (trial: string, time: number) => {
    const wr = wrs.get(trial)
    if (!wr) return 0
    return time <= wr ? 1 : calculateScore(wr, time, trial as TrialName)
  }

  const targets: Target[] = []
  for (const trial of openTrials) {
    const wr = wrs.get(trial)
    if (!wr) continue
    const pb = mine.get(trial)
    if (pb === undefined) {
      const goal = plats[trial as TrialName]
      if (goal) targets.push({ trial, from: null, goal, gain: trialScore(trial, goal) / count })
      continue
    }
    if (pb <= wr) continue
    const goal = Math.max(wr, Math.round(pb * (1 - TARGET_CUT) * 1000) / 1000)
    targets.push({ trial, from: pb, goal, gain: (trialScore(trial, goal) - trialScore(trial, pb)) / count })
  }
  return targets.sort((a, b) => b.gain - a.gain).slice(0, 4)
}

// The signed-in homepage: where you stand, your latest runs and the week's
// records, with the next things worth doing on the side.
export function HomeDashboard({ user }: { user: AuthSessionUser }) {
  const now = useNow()
  const playerUrl = `${apiV2(`/players/${encodeURIComponent(user.uuid)}`)}?include=pbs,recent_submissions&submissions_limit=5`
  const { data: playerData, loading: playerLoading } = useApi<PlayerResponse>(playerUrl)
  const { data: pendingData } = useApi<CountResponse>(`${apiV2("/submissions")}?player_uuid=${encodeURIComponent(user.uuid)}&state=pending&limit=1`)
  const { records } = useWorldRecords()
  const { breaks, loading: recordsLoading } = useRecordTimeline()
  const { players, total, loading: playersLoading } = useTopPlayers(5)
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const { giveaway, prize } = useUpForGrabs()

  const player = playerData?.data?.player
  const score = Number(player?.score ?? user.score ?? 0)
  const tier = tierForScore(score)
  const next = nextTier(score)
  const pbs = player?.pbs ?? []
  const openTrials = orderedTrialNames.filter((trial) => !removedTrials.has(trial))
  const wrsHeld = records.filter((record) => record.player_uuid === user.uuid).length
  const progress = next ? Math.min(1, Math.max(0, (score - tier.min) / (next.tier.min - tier.min))) : 1
  const targets = bestTargets(pbs, records, openTrials, score)
  const runs = player?.recent_submissions ?? []
  const recent = thisWeek(breaks, now)
  const mySubmissions = `/submissions/trials?player_uuid=${encodeURIComponent(user.uuid)}`

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-end gap-x-12 gap-y-8 px-4 pb-9 pt-10 md:pt-12">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
            <span className="label-caps text-sm text-subtle-foreground">Welcome back</span>
            <h1 className="break-words font-display text-[56px] font-extrabold uppercase leading-[0.9] sm:text-[72px] md:text-[88px]">{user.player_name}</h1>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
              <span className="num text-[40px] font-semibold leading-none">{formatScore(score)}</span>
              <TierLabel tier={tier} className="text-[22px]" />
              {player?.rank ? (
                <span className="text-muted-foreground">
                  #{formatCount(player.rank)}
                  {total ? ` of ${formatCount(total)} players` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5">
            {next ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label-caps text-[13px] text-subtle-foreground">Next tier</span>
                  <span className="text-[15px]">
                    <span className="num font-semibold">{formatScore(next.needed)}</span> <span className="text-muted-foreground">to</span>{" "}
                    <TierLabel tier={next.tier} className="text-[15px]" />
                  </span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-sm bg-surface-3"
                  role="progressbar"
                  aria-label={`Progress to ${next.tier.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div className="h-full" style={{ width: `${progress * 100}%`, background: next.tier.color }} />
                </div>
                <div className="num flex justify-between text-[12px] text-subtle-foreground">
                  <span>{tier.min.toFixed(3)}</span>
                  <span>{next.tier.min.toFixed(3)}</span>
                </div>
              </>
            ) : (
              <p className="label-caps text-[15px]" style={{ color: tier.color }}>
                Top tier. Nothing left above you.
              </p>
            )}
            <dl className="m-0 mt-1.5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
              {[
                { label: "PBs", value: playerLoading ? null : `${pbs.filter((pb) => openTrials.includes(pb.trial_name as TrialName)).length}/${openTrials.length}` },
                { label: "Pending", value: pendingData ? formatCount(pendingData.meta?.count ?? 0) : null },
                { label: "WRs held", value: records.length ? formatCount(wrsHeld) : null },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse gap-0.5 bg-surface px-3 py-2.5">
                  <dt className="label-caps text-[12px] text-subtle-foreground">{stat.label}</dt>
                  <dd className="num m-0 text-[18px]">{stat.value ?? <Skeleton className="h-6 w-12 bg-surface-3" />}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-10 px-4 pb-16 pt-9">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <section aria-labelledby="home-runs" className="flex flex-col">
            <SectionHead id="home-runs" title="Your recent runs" href={mySubmissions} linkLabel="Your submissions" />
            {playerLoading ? (
              <div className="flex flex-col">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="my-2 h-9 w-full bg-surface" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 py-6">
                <p className="text-[15px] text-muted-foreground">You haven&apos;t submitted a run yet.</p>
                <Button asChild>
                  <Link href="/submit">Submit your first run</Link>
                </Button>
              </div>
            ) : (
              <ul className="m-0 list-none p-0">
                {runs.map((run, index) => (
                  <li
                    key={run.uuid}
                    className={cn(
                      "relative grid min-h-13 grid-cols-[minmax(0,1fr)_5rem_6.75rem] items-center gap-3 border-b sm:grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_6.75rem] border-[#1c1c1c] px-3 transition-colors hover:bg-surface-3",
                      index % 2 === 1 && "bg-surface"
                    )}
                  >
                    <Link href={runHref(run.uuid)} className="truncate font-display text-[20px] font-bold uppercase tracking-[0.03em] after:absolute after:inset-0">
                      {run.trial_name}
                    </Link>
                    <span className="num font-semibold">{formatTime(run.time)}</span>
                    <span className="hidden truncate text-[13px] text-subtle-foreground sm:block">{formatRelative(Number(run.date), now)}</span>
                    <StatusBadge state={normalizeRunState(run.state)} className="justify-self-end" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="home-week" className="flex flex-col">
            <SectionHead id="home-week" title="Records this week" href="/trials" linkLabel="All world records" />
            <RecordRows breaks={recent.slice(0, 8)} loading={recordsLoading} empty="No world records broken this week yet." />
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-8">
          {giveaway ? <GiveawayCard giveaway={giveaway} now={now} /> : prize ? <PrizeTeaser prize={prize} now={now} /> : null}

          <section aria-labelledby="home-targets" className="flex flex-col">
            <SectionHead id="home-targets" title="Your best targets" description="What 2% off a PB is worth, or platinum on a trial you haven't run." />
            {playerLoading || !records.length ? (
              <div className="flex flex-col">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="my-2 h-10 w-full bg-surface" />
                ))}
              </div>
            ) : targets.length === 0 ? (
              <p className="py-5 text-[15px] text-muted-foreground">You hold every record. Nothing to chase.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {targets.map((target) => (
                  <li key={target.trial} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-[#1c1c1c] px-1 py-2.5">
                    <Link href={trialHref(target.trial)} className="truncate font-display text-[18px] font-bold uppercase hover:text-primary">
                      {target.trial}
                    </Link>
                    <span className="num text-right text-success">+{formatScore(target.gain)}</span>
                    <span className="num text-[13px] text-subtle-foreground">
                      {target.from === null ? "No time yet" : `PB ${formatTime(target.from)}`} → {formatTime(target.goal)}
                    </span>
                    <span className="text-right text-[13px] text-subtle-foreground">score</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="home-top" className="flex flex-col">
            <SectionHead id="home-top" title="Top 5" href="/leaderboard" linkLabel="Leaderboard" />
            <TopPlayerRows players={players} loading={playersLoading} count={5} highlight={user.uuid} />
          </section>
        </aside>
      </div>
    </>
  )
}
