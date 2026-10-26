"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { apiV2 } from "@/lib/api"
import {
  ACTIVITY_METRICS,
  parseAnalyticsRange,
  quantile,
  RANGE_LABELS,
  ANALYTICS_RANGES,
  type ActivityMetric,
  type AnalyticsRange,
  type PublicAnalytics,
} from "@/lib/analytics"
import { formatCount, formatScore } from "@/lib/format"
import { TIERS, tierForScore } from "@/lib/tiers"
import { trialFromSlug, trialSlug } from "@/lib/trial-slug"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useNow } from "@/hooks/use-now"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PERMISSION_MODERATOR } from "@/components/site/admin/admin-kit"
import { PageHeader } from "@/components/site/page-header"
import { PlayerPicker, type PickedPlayer } from "@/components/site/player-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { deriveTrial } from "./analytics-data"
import {
  BarList,
  CategoryColumns,
  Card,
  ColumnChart,
  CorrelationGrid,
  DistributionChart,
  Segmented,
  Stat,
  StatGrid,
  WeekHourHeatmap,
  type Marker,
} from "./charts"
import { StaffSection } from "./staff-section"
import { CompareTrials, TrialDeepDive, TrialsTable, type Overlay, type Unit } from "./trial-section"

type AnalyticsResponse = { data?: PublicAnalytics }
type PlayerResponse = { data?: { player?: (PickedPlayer & { pbs?: Array<{ trial_name: string; time: number }> }) | null } }

const ME_COLOR = "var(--primary)"
const PICKED_COLOR = "var(--chart-2)"

const METRIC_LABELS: Record<ActivityMetric, string> = {
  submitted: "Runs submitted",
  approved: "Runs approved",
  pbs: "PBs set",
  wrs: "World records",
  new_players: "New players",
  active_players: "Players submitting",
}

function usePlayer(uuid: string | null) {
  const { data } = useApi<PlayerResponse>(uuid ? apiV2(`/players/${encodeURIComponent(uuid)}?include=pbs`) : null)
  return data?.data?.player ?? null
}

// /analytics: every trial's distribution and stats, how trials compare,
// site activity and where players stand, for anyone. Moderators also get
// the queue, the video pipeline and accounts at the bottom.
export function AnalyticsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const now = useNow()
  const { user } = useAuthSession()
  // Junior moderators and up, the same gate the staff endpoint uses.
  const staff = Boolean(user && user.permission >= PERMISSION_MODERATOR)

  const range = parseAnalyticsRange(searchParams.get("range"))
  const unit: Unit = searchParams.get("unit") === "score" ? "score" : "time"
  const pickedUuid = searchParams.get("player") || null
  const { data, error } = useApi<AnalyticsResponse>(`${apiV2("/analytics")}?range=${range}`)
  const analytics = data?.data?.range === range ? data.data : undefined

  const meDetail = usePlayer(user?.uuid ?? null)
  const pickedDetail = usePlayer(pickedUuid && pickedUuid !== user?.uuid ? pickedUuid : null)

  const setParams = (next: Record<string, string | null>, hash?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.replace(`${query ? `${pathname}?${query}` : pathname}${hash ?? ""}`, { scroll: false })
  }

  const trials = (analytics?.trials ?? []).map((trial) => deriveTrial(trial, now))
  const trialParam = trialFromSlug(searchParams.get("trial") ?? "")
  const selected =
    trials.find((trial) => trial.trial_name === trialParam) ?? [...trials].sort((a, b) => b.count - a.count)[0] ?? null

  const overlays: Overlay[] = []
  if (meDetail) {
    overlays.push({ uuid: meDetail.uuid, name: "You", color: ME_COLOR, pbs: new Map((meDetail.pbs ?? []).map((pb) => [pb.trial_name, Number(pb.time)])) })
  }
  if (pickedDetail) {
    overlays.push({
      uuid: pickedDetail.uuid,
      name: pickedDetail.player_name,
      color: PICKED_COLOR,
      pbs: new Map((pickedDetail.pbs ?? []).map((pb) => [pb.trial_name, Number(pb.time)])),
    })
  }

  const me: PickedPlayer | null = user
    ? {
        uuid: user.uuid,
        player_name: user.player_name,
        score: Number(user.score),
        discord_id: user.discord_id,
        discord_avatar: user.discord_avatar,
        discord_discriminator: user.discord_discriminator,
        has_roblox_avatar: user.has_roblox_avatar,
      }
    : null

  const selectTrial = (name: string) => {
    setParams({ trial: trialSlug(name) })
    document.getElementById("trial-dive")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const trialLink = (name: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("trial", trialSlug(name))
    return `${pathname}?${params.toString()}#trial-dive`
  }

  const sections = [
    { id: "trials", label: "Trials" },
    { id: "compare", label: "Compare" },
    { id: "activity", label: "Activity" },
    { id: "players", label: "Players" },
    ...(staff ? [{ id: "staff", label: "Staff" }] : []),
  ]

  return (
    <div className="pb-16">
      <PageHeader
        title="Analytics"
        description="Every trial's spread of times, how the trials compare, when people play and where players stand. Pick a player to see them on every chart."
      />

      <SectionNav sections={sections} range={range} onRange={(value) => setParams({ range: value === "30d" ? null : value })} />

      <main className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pt-8">
        {error && !analytics ? <p className="m-0 text-sm text-destructive">Couldn&apos;t load analytics: {error}</p> : null}

        <section id="trials" aria-labelledby="trials-heading" className="flex scroll-mt-32 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle id="trials-heading" title="Trials">
              Distributions are current PBs. Your PB is marked when you&apos;re signed in.
            </SectionTitle>
            <div className="w-full sm:w-72">
              <PlayerPicker
                label="Show a player"
                placeholder="Show a player on the charts"
                value={pickedDetail ?? (pickedUuid && pickedUuid === user?.uuid ? meDetail : null)}
                onChange={(player) => setParams({ player: player?.uuid ?? null })}
                me={me}
                exclude={user?.uuid ?? null}
                clearable
              />
            </div>
          </div>
          <div id="trial-dive" className="scroll-mt-32">
            {analytics && selected ? (
              <TrialDeepDive
                trial={selected}
                trialNames={trials.map((trial) => trial.trial_name)}
                onSelect={(name) => setParams({ trial: trialSlug(name) })}
                unit={unit}
                onUnit={(value) => setParams({ unit: value === "time" ? null : value })}
                overlays={overlays}
                range={range}
                rangeLabel={RANGE_LABELS[range]}
                now={now}
              />
            ) : (
              <Skeleton className="h-[640px] w-full" />
            )}
          </div>
          {analytics ? <TrialsTable trials={trials} selected={selected?.trial_name ?? ""} onSelect={selectTrial} rangeLabel={RANGE_LABELS[range]} /> : null}
        </section>

        <section id="compare" aria-labelledby="compare-heading" className="flex scroll-mt-32 flex-col gap-4">
          <SectionTitle id="compare-heading" title="Compare">
            Which trials are hardest, busiest and closest at the top, and which go together.
          </SectionTitle>
          {analytics ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <CompareTrials trials={trials} analyticsHref={trialLink} />
              <Card
                title="Trials that go together"
                description="How closely players' scores on one trial track their scores on another (correlation, over players with a PB on both). Click a trial to open it."
              >
                <CorrelationGrid
                  trials={analytics.correlation.trials}
                  matrix={analytics.correlation.matrix}
                  samples={analytics.correlation.samples}
                  onPick={selectTrial}
                />
              </Card>
            </div>
          ) : (
            <Skeleton className="h-[420px] w-full" />
          )}
        </section>

        <section id="activity" aria-labelledby="activity-heading" className="flex scroll-mt-32 flex-col gap-4">
          <SectionTitle id="activity-heading" title="Activity">
            {range === "all" ? "Everything since the first run." : `The last ${RANGE_LABELS[range].toLowerCase()}, against the ${RANGE_LABELS[range].toLowerCase()} before.`}
          </SectionTitle>
          {analytics ? <Activity analytics={analytics} /> : <Skeleton className="h-[480px] w-full" />}
        </section>

        <section id="players" aria-labelledby="players-heading" className="flex scroll-mt-32 flex-col gap-4">
          <SectionTitle id="players-heading" title="Players">
            Scores, tiers and how much the leaderboard moves.
          </SectionTitle>
          {analytics ? <Players analytics={analytics} me={meDetail} picked={pickedDetail} /> : <Skeleton className="h-[480px] w-full" />}
        </section>

        {staff ? (
          <section id="staff" aria-labelledby="staff-heading" className="flex scroll-mt-32 flex-col gap-4">
            <SectionTitle id="staff-heading" title="Staff">
              Only moderators see this part.
            </SectionTitle>
            <StaffSection range={range} rangeLabel={RANGE_LABELS[range]} now={now} />
          </section>
        ) : null}
      </main>
    </div>
  )
}

function SectionTitle({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={id} className="font-display text-[30px] font-extrabold uppercase leading-none md:text-[34px]">
        {title}
      </h2>
      {children ? <p className="m-0 text-[14px] text-muted-foreground">{children}</p> : null}
    </div>
  )
}

function SectionNav({
  sections,
  range,
  onRange,
}: {
  sections: Array<{ id: string; label: string }>
  range: AnalyticsRange
  onRange: (range: AnalyticsRange) => void
}) {
  const [active, setActive] = useState(sections[0]?.id)
  const ids = sections.map((section) => section.id).join(",")

  useEffect(() => {
    const elements = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-120px 0px -60% 0px" }
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [ids])

  return (
    <nav aria-label="Analytics sections" className="sticky top-14 z-20 border-b border-line bg-background">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-2 md:h-12 md:flex-row md:items-stretch md:justify-between md:py-0">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
              className={cn(
                "label-caps flex h-9 shrink-0 items-center px-3 text-[15px] transition-colors md:h-auto",
                active === section.id ? "text-foreground shadow-[inset_0_-3px_0_var(--primary)]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {section.label}
            </a>
          ))}
        </div>
        <div className="flex items-center">
          <Segmented
            size="sm"
            label="Time range"
            value={range}
            onChange={onRange}
            options={ANALYTICS_RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }))}
          />
        </div>
      </div>
    </nav>
  )
}

function Activity({ analytics }: { analytics: PublicAnalytics }) {
  const [metric, setMetric] = useState<ActivityMetric>("submitted")
  const [offsetHours] = useState(() => Math.round(-new Date().getTimezoneOffset() / 60))
  const { totals, previous, series, heatmap } = analytics.activity
  const approvalRate = totals.submitted ? (totals.approved / totals.submitted) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        {ACTIVITY_METRICS.map((key) => (
          <Stat
            key={key}
            label={METRIC_LABELS[key]}
            value={formatCount(totals[key])}
            delta={previous ? { current: totals[key], previous: previous[key] } : null}
            sub={key === "approved" && approvalRate != null ? `${approvalRate.toFixed(0)}% of runs` : undefined}
          />
        ))}
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title={METRIC_LABELS[metric]}
          description={`Per ${analytics.bucket}.${metric === "active_players" ? " Each player counts once per period." : ""}`}
          aside={
            <Segmented
              size="sm"
              label="Metric"
              value={metric}
              onChange={setMetric}
              options={ACTIVITY_METRICS.map((key) => ({ value: key, label: METRIC_LABELS[key].replace("Runs ", "") }))}
            />
          }
        >
          <ColumnChart bucket={analytics.bucket} series={[{ key: metric, label: METRIC_LABELS[metric], color: "var(--primary)", points: series[metric] }]} />
        </Card>
        <Card title="When runs come in" description="Runs submitted by weekday and hour.">
          <WeekHourHeatmap grid={heatmap} offsetHours={offsetHours} />
        </Card>
      </div>
    </div>
  )
}

type PlayerDetail = (PickedPlayer & { pbs?: Array<{ trial_name: string; time: number }> }) | null

function Players({ analytics, me, picked }: { analytics: PublicAnalytics; me: PlayerDetail; picked: PlayerDetail }) {
  const [includeZero, setIncludeZero] = useState(false)
  const { players } = analytics
  const scores = includeZero ? players.scores : players.scores.filter((score) => score > 0)
  const sorted = [...players.scores].sort((a, b) => a - b)
  const counted = Math.max(1, players.counted_trials)
  const attempted = [...players.trials_attempted].sort((a, b) => a - b)
  const completionists = attempted.filter((count) => count >= counted).length
  const maxAttempted = Math.max(counted, ...attempted, 1)
  const attemptedRows = Array.from({ length: maxAttempted }, (_, index) => {
    const count = index + 1
    return {
      key: String(count),
      label: String(count),
      value: attempted.filter((value) => value === count).length,
      note: `${count} ${count === 1 ? "trial" : "trials"}`,
      color: count >= counted ? "var(--gold)" : undefined,
    }
  })

  const tierCounts = TIERS.map((tier) => ({ tier, count: 0 }))
  for (const score of players.scores) {
    const tier = tierForScore(score)
    const entry = tierCounts.find((item) => item.tier.key === tier.key)
    if (entry) entry.count += 1
  }

  const markers: Marker[] = TIERS.filter((tier) => tier.min > 0).map((tier) => ({ value: tier.min, label: tier.short, color: tier.color, dashed: true }))
  const overlayScores = [
    me ? { name: "You", score: Number(me.score), color: ME_COLOR } : null,
    picked ? { name: picked.player_name, score: Number(picked.score), color: PICKED_COLOR } : null,
  ].filter((entry): entry is { name: string; score: number; color: string } => entry !== null)
  for (const entry of overlayScores) markers.push({ value: entry.score, label: entry.name, color: entry.color })

  const churn = players.churn
  const hasChurn = Boolean(churn.from && churn.to && churn.from !== churn.to)
  const top = scores.length ? Math.max(...scores) : 1

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <Stat label="Players" value={formatCount(players.scores.length)} sub={`${formatCount(players.with_pb)} with a PB`} />
        <Stat label="Median score" value={formatScore(quantile(sorted, 0.5))} sub={`top 10% from ${formatScore(quantile(sorted, 0.9))}`} />
        <Stat label="Completionists" value={formatCount(completionists)} tone={completionists ? "gold" : "muted"} sub={`a PB on all ${counted} trials`} />
        <Stat label="Trials per player" value={attempted.length ? quantile(attempted, 0.5).toFixed(0) : "—"} sub="median, with a PB" />
        <Stat label="Moved up" value={hasChurn ? formatCount(churn.moved_up) : "—"} sub={hasChurn ? `${formatCount(churn.moved_down)} down since ${churn.from}` : "not enough rank history"} />
        <Stat label="Top 10 kept" value={hasChurn ? `${churn.top10_kept}/10` : "—"} sub={hasChurn ? `avg move ${churn.average_move} places` : ""} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card
          title="Score distribution"
          description="Every player's overall score, with the tier lines."
          aside={
            <Segmented
              size="sm"
              label="Zero scores"
              value={includeZero ? "all" : "scoring"}
              onChange={(value) => setIncludeZero(value === "all")}
              options={[
                { value: "scoring", label: "Scoring" },
                { value: "all", label: "Everyone" },
              ]}
            />
          }
        >
          <DistributionChart
            key={includeZero ? "all" : "scoring"}
            values={scores}
            markers={markers}
            format={(value) => value.toFixed(2)}
            domain={[0, Math.min(1, Math.max(top, 0.95))]}
            showCurve={false}
            unitLabel="Overall score"
          />
        </Card>
        <Card title="Tiers" description="Players in each score tier.">
          <BarList
            rows={[...tierCounts].reverse().map(({ tier, count }) => ({
              key: tier.key,
              label: <span style={{ color: tier.color }}>{tier.name}</span>,
              value: count,
              color: tier.color,
              sub: players.scores.length ? `${((count / players.scores.length) * 100).toFixed(1)}%` : undefined,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Trials with a PB" description="How many trials each player has a PB on. Gold: every counted trial.">
          <CategoryColumns rows={attemptedRows} />
        </Card>
        <Card title="Most world records" description="Players holding the most current records.">
          <BarList
            rows={players.wr_holders.map((row) => ({ key: row.player_uuid, label: row.player_name, value: row.count, color: "var(--gold)", href: `/players/${row.player_uuid}` }))}
            limit={8}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Biggest score gains" description={`Score added over the range, from each player's first score change in it.`}>
          <BarList
            rows={players.improvers.map((row) => ({
              key: row.player_uuid,
              label: row.player_name,
              value: row.score_change,
              display: `+${row.score_change.toFixed(3)}`,
              href: `/players/${row.player_uuid}`,
            }))}
            empty="Nobody's score went up in this range."
          />
        </Card>
        <Card title="Biggest climbers" description={hasChurn ? `Overall rank on ${churn.from} against ${churn.to}.` : "Needs daily rank snapshots across the range."}>
          <BarList
            rows={churn.climbers.map((row) => ({
              key: row.player_uuid,
              label: row.player_name,
              value: row.from - row.to,
              display: `+${row.from - row.to}`,
              sub: `#${row.from} → #${row.to}`,
              href: `/players/${row.player_uuid}`,
            }))}
            empty="Nobody moved up in this range."
          />
        </Card>
      </div>
    </div>
  )
}
