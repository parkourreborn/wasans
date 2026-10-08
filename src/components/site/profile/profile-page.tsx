"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowLeftRightIcon, CalculatorIcon, PlayIcon, Settings2Icon, TrophyIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { permissionLabel } from "@/lib/auth-actions"
import { formatCount, formatDate, formatScore, formatTime } from "@/lib/format"
import { openSettings } from "@/lib/linked-accounts"
import { trialScorer } from "@/lib/score-estimate"
import { nextTier, tierForScore, TIERS } from "@/lib/tiers"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useNow } from "@/hooks/use-now"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { runPosterUrl, runVideoUrl } from "@/components/site/run-video"
import { TierLabel } from "@/components/site/tier-label"
import type { WorldRecordsResponse } from "@/components/site/trials-index"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HistoryChart, type ChartPoint } from "./history-chart"
import {
  activityFor,
  formatAgo,
  median,
  MEDALS,
  medalFor,
  recordsFor,
  type HistoryEntry,
  type Medal,
  type ProfileAnalytics,
  type ProfilePlayer,
} from "./profile-data"
import { ActivitySection, CombosSection, GainsSection, MedalSwatch, RecordsSection, RunsSection, TrialsSection, type TrialRow } from "./profile-sections"

type PlayerResponse = { data?: { player?: ProfilePlayer | null } }
type HistoryResponse = { data?: HistoryEntry[] }
type CountResponse = { meta?: { count?: number; total?: number } }

export function ProfilePage({ uuid }: { uuid: string }) {
  const now = useNow()
  const { user } = useAuthSession()
  const own = user?.uuid === uuid
  const player = useApi<PlayerResponse>(apiV2(`/players/${encodeURIComponent(uuid)}?include=pbs,combo_pbs,prizes`))
  const analytics = useApi<{ data?: ProfileAnalytics }>(apiV2(`/players/${encodeURIComponent(uuid)}/analytics`))
  const { data: wrData } = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const { data: historyData } = useApi<HistoryResponse>(apiV2("/records/world/history"))
  const { data: playersData } = useApi<CountResponse>(`${apiV2("/players")}?limit=1`)
  const { data: approvedData } = useApi<CountResponse>(`${apiV2("/submissions")}?player_uuid=${encodeURIComponent(uuid)}&state=approved&limit=1`)
  const { data: pendingData } = useApi<CountResponse>(`${apiV2("/submissions")}?player_uuid=${encodeURIComponent(uuid)}&state=pending&limit=1`)
  const { orderedTrialNames, removedTrials } = useTrialOrder()

  const profile = player.data?.data?.player ?? null
  if (!profile) {
    if (player.loading || (!player.data && !player.error)) return <ProfileSkeleton />
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-24">
        <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.9]">Player not found</h1>
        <p className="text-[15px] text-muted-foreground">
          {player.error && player.data === undefined ? player.error : "This account doesn't exist or was deactivated."}{" "}
          <Link href="/leaderboard" className="underline underline-offset-4">
            Back to the leaderboard
          </Link>
        </p>
      </div>
    )
  }

  const records = wrData?.data ?? []
  const scoreOf = trialScorer(records)
  const wrUuids = new Set(records.map((record) => record.submission_uuid))
  const pbs = new Map((profile.pbs ?? []).map((pb) => [pb.trial_name, pb]))
  const trialRows: TrialRow[] = orderedTrialNames.map((trial) => {
    const pb = pbs.get(trial) ?? null
    return {
      trial,
      retired: removedTrials.has(trial),
      pb,
      score: pb ? scoreOf(trial, Number(pb.time)) : 0,
      medal: medalFor(trial, pb ? Number(pb.time) : null, Boolean(pb && wrUuids.has(pb.submission_uuid))),
    }
  })
  const { held, lost, allTime } = recordsFor(historyData?.data ?? [], uuid, wrUuids)
  const stats = analytics.data?.data
  const events = activityFor(stats?.score_history ?? [], lost)
  const medianRank = median((profile.pbs ?? []).map((pb) => pb.rank ?? 0).filter((rank) => rank > 0))
  const combos = profile.combo_pbs ?? []
  const bestCombo = [...combos].sort((a, b) => b.combo_count - a.combo_count)[0]

  // The cover: a frame from their best-scoring run that has a processed video.
  const coverRow = trialRows
    .filter((row) => row.pb && (row.pb.video_status ?? "ready") === "ready")
    .sort((a, b) => b.score - a.score)[0]

  const sections = [
    own ? { id: "gains", label: "Biggest gains" } : null,
    { id: "trials", label: "Trials", count: `${trialRows.filter((row) => row.pb).length}/${trialRows.length}` },
    allTime > 0 ? { id: "records", label: "Records", count: String(held.length) } : null,
    { id: "activity", label: "Activity" },
    combos.length > 0 ? { id: "combos", label: "Combos", count: String(combos.length) } : null,
    { id: "runs", label: "Runs", count: approvedData?.meta?.count !== undefined ? formatCount(approvedData.meta.count) : undefined },
  ].filter((section) => section !== null)

  return (
    <div className="pb-16">
      <Cover playerName={profile.player_name} row={coverRow} own={own} />
      <ProfileHeader profile={profile} own={own} viewerUuid={user?.uuid ?? null} lastPbAt={stats?.last_pb_at ?? null} now={now} />

      <section aria-label="Stats" className="mx-auto mt-6 max-w-[1200px] px-4">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="grid lg:grid-cols-[22rem_minmax(0,1fr)]">
            <RankScore profile={profile} analytics={stats} total={playersData?.meta?.total} />
            <ChartPanel analytics={stats} loading={analytics.loading} now={now} />
          </div>
          <MedalStrip rows={trialRows} />
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
            <Tile label="World records" value={String(held.length)} sub={`${allTime} all-time`} highlight={held.length > 0} muted={held.length === 0} />
            <Tile label="Median trial rank" value={medianRank ? `#${formatCount(medianRank)}` : "—"} sub={`across ${pbs.size} ${pbs.size === 1 ? "trial" : "trials"}`} />
            <Tile
              label="Approved runs"
              value={approvedData?.meta?.count !== undefined ? formatCount(approvedData.meta.count) : "—"}
              sub={pendingData?.meta?.count ? `${pendingData.meta.count} waiting for review` : "none waiting"}
            />
            <Tile label="Combo PBs" value={String(combos.length)} sub={bestCombo ? `best ${formatCount(bestCombo.combo_count)}` : "none yet"} muted={combos.length === 0} />
          </div>
        </div>
      </section>

      <SectionNav sections={sections} />

      <main className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pt-8">
        {own ? <GainsSection playerUuid={uuid} /> : null}
        <TrialsSection rows={trialRows} now={now} own={own} />
        <div className="grid items-start gap-14 lg:grid-cols-2 lg:gap-x-12">
          <div className="flex min-w-0 flex-col gap-14">
            {allTime > 0 ? <RecordsSection held={held} lost={lost} allTime={allTime} now={now} /> : null}
            {combos.length > 0 ? <CombosSection combos={combos} now={now} /> : null}
          </div>
          <ActivitySection events={events} pbs={pbs} now={now} />
        </div>
        <RunsSection playerUuid={uuid} wrUuids={wrUuids} now={now} />
      </main>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-36 w-full rounded-none md:h-44" />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6">
        <Skeleton className="h-14 w-72" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}

// The cover plays the run on computers only: a full run on every profile
// visit is a lot of mobile data. Phones, data saver and reduced motion keep
// the still poster.
const COVER_VIDEO_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"

function subscribeCoverVideo(listener: () => void) {
  const query = window.matchMedia(COVER_VIDEO_QUERY)
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

function coverVideoAllowed() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return window.matchMedia(COVER_VIDEO_QUERY).matches && !connection?.saveData
}

function Cover({ playerName, row, own }: { playerName: string; row?: TrialRow; own: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  const [videoFailed, setVideoFailed] = useState<string | null>(null)
  const playVideo = useSyncExternalStore(subscribeCoverVideo, coverVideoAllowed, () => false)
  const pb = row?.pb
  const showImage = pb && failed !== pb.submission_uuid
  const showVideo = pb && playVideo && videoFailed !== pb.submission_uuid
  return (
    <div className="relative h-32 overflow-hidden border-b border-line bg-surface md:h-44">
      {showVideo ? (
        <video
          key={pb.submission_uuid}
          src={runVideoUrl(pb.submission_uuid)}
          poster={showImage ? runPosterUrl(pb.submission_uuid) : undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          onError={() => setVideoFailed(pb.submission_uuid)}
          className="absolute inset-0 size-full object-cover opacity-60"
        />
      ) : showImage ? (
        // A plain img: the poster lives on the assets host and may be missing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={runPosterUrl(pb.submission_uuid)}
          alt=""
          onError={() => setFailed(pb.submission_uuid)}
          className="absolute inset-0 size-full object-cover opacity-60"
        />
      ) : null}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.05)_0%,rgba(8,8,8,0.35)_55%,rgba(8,8,8,0.9)_100%)]" />
      {(showImage || showVideo) && pb && row ? (
        <div className="relative mx-auto flex h-full max-w-[1200px] items-start justify-end px-4 pt-3 md:items-end md:pb-3.5">
          <Link
            href={`/submissions/${encodeURIComponent(pb.submission_uuid)}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-background/75 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-[#5a5a5a] hover:text-foreground"
            aria-label={`Cover from ${own ? "your" : `${playerName}'s`} ${row.trial} run, ${formatTime(pb.time)}. Watch it`}
          >
            <PlayIcon className="size-3" aria-hidden />
            From {own ? "your" : "the"} {row.trial} {row.medal === "wr" ? "world record" : "PB"},{" "}
            <span className="num text-foreground">{formatTime(pb.time)}</span>
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function ProfileHeader({
  profile,
  own,
  viewerUuid,
  lastPbAt,
  now,
}: {
  profile: ProfilePlayer
  own: boolean
  viewerUuid: string | null
  lastPbAt: number | null
  now: number
}) {
  const tier = tierForScore(Number(profile.score))
  const prizes = profile.prizes ?? []
  return (
    <section aria-label="Player" className="mx-auto max-w-[1200px] px-4">
      <div className="relative flex flex-wrap items-start gap-x-6 gap-y-4 pl-[108px] pt-3 md:pl-[152px] md:pt-4">
        <PlayerAvatar
          playerName={profile.player_name}
          playerUuid={profile.uuid}
          hasRobloxAvatar={profile.has_roblox_avatar}
          discordId={profile.discord_id}
          discordAvatar={profile.discord_avatar}
          discordDiscriminator={profile.discord_discriminator}
          className="absolute -top-11 left-0 size-[92px] rounded-md border-4 border-background bg-background md:-top-16 md:size-32 [&_[data-slot=avatar-fallback]]:rounded-sm [&_[data-slot=avatar-fallback]]:font-display [&_[data-slot=avatar-fallback]]:text-3xl md:[&_[data-slot=avatar-fallback]]:text-[44px] [&_[data-slot=avatar-image]]:rounded-sm"
        />
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-2.5">
          <h1 className="break-words font-display text-[36px] font-bold leading-[0.95] md:text-[54px]">{profile.player_name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <TierLabel tier={tier} className="text-[16px]" />
            {profile.permission > 0 ? (
              <span className="label-caps inline-flex h-6 items-center border border-line-strong px-2 text-[12px]">{permissionLabel(profile.permission)}</span>
            ) : null}
            <span>
              Joined <span className="text-foreground">{formatDate(profile.date_joined)}</span>
            </span>
            {lastPbAt ? (
              <span>
                Last PB <span className="text-foreground">{formatAgo(lastPbAt, now, formatDate)}</span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:pt-1">
          {own ? (
            <>
              <Button asChild variant="outline">
                <Link href="/calculator">
                  <CalculatorIcon />
                  Calculator
                </Link>
              </Button>
              <Button type="button" variant="outline" onClick={openSettings}>
                <Settings2Icon />
                Settings
              </Button>
            </>
          ) : (
            <>
              {viewerUuid ? (
                <Button asChild variant="outline">
                  <Link href={`/calculator?a=${encodeURIComponent(viewerUuid)}&b=${encodeURIComponent(profile.uuid)}`}>
                    <ArrowLeftRightIcon />
                    Compare with me
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={`/calculator?a=${encodeURIComponent(profile.uuid)}`}>
                  <CalculatorIcon />
                  Try their times
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {prizes.length > 0 ? (
        <ul aria-label="Prizes won" className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0">
          {prizes.map((prize) => (
            <li key={`${prize.prize_uuid}-${prize.awarded_at}`}>
              <Link
                href="/prizes"
                className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] transition-colors hover:border-line-strong"
              >
                <TrophyIcon className="size-3.5 text-muted-foreground" aria-hidden />
                {prize.title}
                <span className="text-[12px] text-subtle-foreground">{formatDate(prize.awarded_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function RankScore({ profile, analytics, total }: { profile: ProfilePlayer; analytics?: ProfileAnalytics; total?: number }) {
  const score = Number(profile.score)
  const tier = tierForScore(score)
  const next = nextTier(score)
  const floor = tier.min
  const ceiling = next ? next.tier.min : 1
  const progress = Math.max(0, Math.min(1, (score - floor) / (ceiling - floor || 1)))
  const peak = analytics?.peak_rank
  const peakDate = peak ? new Date(`${peak.date}T00:00:00Z`) : null
  const peakText =
    peak && peak.rank < profile.rank
      ? `Peak #${peak.rank} in ${peakDate?.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
      : peak
        ? "Best rank yet"
        : null

  return (
    <div className="flex flex-col justify-between gap-6 border-b border-line p-5 lg:border-b-0 lg:border-r lg:p-6">
      <dl className="m-0 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <dt className="label-caps text-[14px] text-subtle-foreground">Rank</dt>
          <dd className="m-0 num text-[42px] font-semibold leading-none md:text-[52px]">#{formatCount(profile.rank)}</dd>
          {peakText ? <dd className="m-0 text-[13px] text-muted-foreground">{peakText}</dd> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <dt className="label-caps text-[14px] text-subtle-foreground">Score</dt>
          <dd className="m-0 num text-[42px] font-semibold leading-none md:text-[52px]">{formatScore(score)}</dd>
          {total ? <dd className="m-0 text-[13px] text-muted-foreground">of {formatCount(total)} players</dd> : null}
        </div>
      </dl>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <TierLabel tier={tier} className="text-[16px]" />
          <span className="text-[13px] text-muted-foreground">
            {next ? (
              <>
                <span className="num text-foreground">{next.needed.toFixed(3)}</span> to <TierLabel tier={next.tier} className="text-[14px]" />
              </>
            ) : (
              "Top tier"
            )}
          </span>
        </div>
        <div
          role="img"
          aria-label={next ? `${Math.round(progress * 100)}% of the way from ${tier.name} to ${next.tier.name}` : `${tier.name}, the top tier`}
          className="h-2 bg-surface-3"
        >
          <div className="h-full" style={{ width: `${progress * 100}%`, background: tier.color }} />
        </div>
        <div className="num flex justify-between text-[12px] text-subtle-foreground">
          <span>{floor.toFixed(3)}</span>
          <span>{ceiling.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}

function ChartPanel({ analytics, loading, now }: { analytics?: ProfileAnalytics; loading: boolean; now: number }) {
  const [view, setView] = useState<"rank" | "score">("rank")
  const rankPoints: ChartPoint[] = (analytics?.rank_history ?? []).map((row) => ({ t: Date.parse(`${row.snapshot_date}T00:00:00Z`) / 1000, v: Number(row.rank) }))
  const scorePoints: ChartPoint[] = (analytics?.score_history ?? []).map((row) => ({ t: Number(row.recorded_at), v: Number(row.score) }))
  const points = view === "rank" ? rankPoints : scorePoints
  const days = points.length > 1 ? Math.round((now - points[0].t) / 86400) : 0

  return (
    <div className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-caps text-[15px] text-muted-foreground">
          {view === "rank" ? "Rank" : "Score"}
          {days > 0 ? `, last ${days} days` : ""}
        </h2>
        <div role="group" aria-label="Chart" className="flex gap-0.5 rounded-md border border-line-strong p-0.5">
          {(["rank", "score"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                "label-caps h-7 rounded px-3 text-[14px] transition-colors",
                view === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-[212px] w-full" />
      ) : (
        <HistoryChart
          key={view}
          points={points}
          invert={view === "rank"}
          format={view === "rank" ? (value) => `#${Math.round(value)}` : (value) => value.toFixed(3)}
          lines={view === "score" ? TIERS.filter((tier) => tier.min > 0).map((tier) => ({ value: tier.min, label: tier.name, color: tier.color })) : []}
          label={view === "rank" ? "Rank over time" : "Score over time"}
          now={now}
        />
      )}
    </div>
  )
}

function MedalStrip({ rows }: { rows: TrialRow[] }) {
  const counts: Record<Medal, number> = { wr: 0, platinum: 0, bronze: 0, none: 0, unplayed: 0 }
  for (const row of rows) counts[row.medal] += 1
  const cells = [...rows].sort((a, b) => MEDALS[a.medal].order - MEDALS[b.medal].order || b.score - a.score)
  const summary = (Object.keys(counts) as Medal[]).map((medal) => `${counts[medal]} ${MEDALS[medal].label}`).join(", ")

  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-4 lg:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="label-caps text-[15px] text-muted-foreground">Medals across {rows.length} trials</h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
          {(Object.keys(counts) as Medal[]).map((medal) => (
            <li key={medal} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MedalSwatch medal={medal} />
              {MEDALS[medal].label}
              <span className={cn("num font-semibold", counts[medal] ? "text-foreground" : "text-subtle-foreground")}>{counts[medal]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div role="img" aria-label={summary} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.max(cells.length, 1)}, minmax(0, 1fr))` }}>
        {cells.map((row) => (
          <span
            key={row.trial}
            title={`${row.trial} · ${MEDALS[row.medal].label}${row.pb ? ` · ${formatTime(row.pb.time)}` : ""}`}
            className="h-5 rounded-[2px] md:h-[22px]"
            style={{ background: MEDALS[row.medal].fill, boxShadow: MEDALS[row.medal].ring }}
          />
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, sub, highlight = false, muted = false }: { label: string; value: string; sub: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-5 py-4 lg:px-6">
      <span className="label-caps text-[13px] text-subtle-foreground">{label}</span>
      <span className={cn("num text-[24px] font-semibold", highlight && "text-gold", muted && "text-subtle-foreground")}>{value}</span>
      <span className="text-[13px] text-muted-foreground">{sub}</span>
    </div>
  )
}

// Jumps to a section; the one being read is underlined.
function SectionNav({ sections }: { sections: Array<{ id: string; label: string; count?: string }> }) {
  const [active, setActive] = useState(sections[0]?.id)
  const ids = sections.map((section) => section.id).join(",")

  useEffect(() => {
    const elements = ids.split(",").map((id) => document.getElementById(id)).filter((element): element is HTMLElement => element !== null)
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
    <nav aria-label="Profile sections" className="sticky top-14 z-20 mt-8 border-y border-line bg-background">
      <div className="mx-auto flex h-12 max-w-[1200px] items-stretch gap-1 overflow-x-auto px-4">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "true" : undefined}
            className={cn(
              "label-caps flex shrink-0 items-center gap-1.5 px-3 text-[15px] transition-colors",
              active === section.id ? "text-foreground shadow-[inset_0_-3px_0_var(--primary)]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {section.label}
            {section.count ? <span className="num text-[12px] tracking-normal text-subtle-foreground">{section.count}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  )
}
