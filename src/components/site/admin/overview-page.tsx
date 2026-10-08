"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { flagName } from "@/lib/admin-logs"
import { formatCount, formatWaiting } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import {
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  formatAgo,
  formatDuration,
  nowSeconds,
} from "@/components/site/admin/admin-kit"

type Counts = { submitted: number; approved: number; new_players: number; submitting_players: number }

type Overview = {
  period_days: 7 | 30
  waiting: {
    pending_trials: number
    pending_combos: number
    oldest_pending_at: number | null
    prize_candidates: number
    errors_24h: number
    latest_error: { created_at: number; message: string; path: string | null } | null
  }
  health: {
    flags: Array<{ key: string; enabled: boolean }>
    video: { processing: number; failed_7d: number; failed_pending: number; avg_seconds_24h: number | null }
    backfill: { started: boolean; remaining: number; inFlight: number; failed: number }
    compilation: { title: string; status: string; created_at: number; finished_at: number | null } | null
  }
  activity: {
    current: Counts
    previous: Counts
    series: Record<keyof Counts, number[]>
    climbers: Array<{ player_uuid: string; player_name: string; score_change: number }>
  }
}

const FLAG_HELP: Record<string, string> = {
  submissions_enabled: "Players can submit trial runs",
  combo_submissions_enabled: "Players can submit combos",
  moderation_enabled: "Moderators can approve and deny",
  require_roblox_link: "A linked Roblox account is needed to submit",
}

const STATS: Array<{ key: keyof Counts; label: string }> = [
  { key: "submitted", label: "Runs and combos submitted" },
  { key: "approved", label: "Approved" },
  { key: "new_players", label: "New players" },
  { key: "submitting_players", label: "Players submitting" },
]

export function AdminOverviewPage() {
  const [period, setPeriod] = useState<7 | 30>(7)
  const { data, error, loading, refetch } = useApi<{ data: Overview }>(`${apiV2("/admin/overview")}?period=${period}`)
  const overview = data?.data
  const now = nowSeconds()

  return (
    <AdminPage title="Overview">
      {error && !overview ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !overview ? <AdminLoading /> : null}
      {overview ? (
        <>
          <Waiting overview={overview} now={now} />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Health overview={overview} now={now} />
            <Activity overview={overview} period={period} onPeriod={setPeriod} />
          </div>
        </>
      ) : null}
    </AdminPage>
  )
}

function Waiting({ overview, now }: { overview: Overview; now: number }) {
  const { waiting, health } = overview
  const queue = waiting.pending_trials + waiting.pending_combos
  const cards = [
    {
      label: "Review queue",
      value: queue,
      sub:
        queue === 0
          ? "Nothing to review."
          : `${formatCount(waiting.pending_trials)} trial ${waiting.pending_trials === 1 ? "run" : "runs"}, ${formatCount(waiting.pending_combos)} ${waiting.pending_combos === 1 ? "combo" : "combos"}. Oldest waiting ${formatWaiting(waiting.oldest_pending_at, now)}.`,
      href: "/review",
      cta: "Open the queue",
      alert: false,
    },
    {
      label: "Prize candidates",
      value: waiting.prize_candidates,
      sub: waiting.prize_candidates === 0 ? "No winners to confirm." : "Detected winners to confirm or reject.",
      href: "/admin/prizes",
      cta: "Confirm winners",
      alert: false,
    },
    {
      label: "Errors, 24 hours",
      value: waiting.errors_24h,
      sub: waiting.latest_error
        ? `Latest ${formatAgo(waiting.latest_error.created_at, now)}: ${waiting.latest_error.message}`
        : "No errors logged.",
      href: "/admin/logs?bucket=errors",
      cta: "Open the logs",
      alert: waiting.errors_24h > 0,
    },
    {
      label: "Failed videos",
      value: health.video.failed_pending,
      sub:
        health.video.failed_pending === 0
          ? "Every pending run has a working video."
          : "Pending runs that can only be denied. The players were told.",
      href: "/submissions/trials?video_status=failed",
      cta: "See the runs",
      alert: false,
    },
  ]

  return (
    <AdminSection title="Waiting on you">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const active = card.value > 0
          return (
            <Link
              key={card.label}
              href={card.href}
              className={cn(
                "group flex flex-col gap-2 rounded-lg border bg-surface p-4 transition-colors hover:border-line-strong",
                card.alert && active ? "border-destructive/50" : active ? "border-line-strong" : "border-line"
              )}
            >
              <span className="label-caps text-[13px] text-subtle-foreground">{card.label}</span>
              <span className={cn("num text-[40px] font-semibold leading-none", card.alert && active ? "text-destructive" : active ? "text-foreground" : "text-subtle-foreground")}>
                {formatCount(card.value)}
              </span>
              <span className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-muted-foreground">{card.sub}</span>
              <span className="label-caps mt-auto flex items-center gap-1 text-[13px] text-muted-foreground group-hover:text-foreground">
                {card.cta}
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </span>
            </Link>
          )
        })}
      </div>
    </AdminSection>
  )
}

type HealthRow = { label: string; sub: string; state: string; tone: "good" | "off" | "warn" | "info" }

const TONE_DOT: Record<HealthRow["tone"], string> = {
  good: "bg-success",
  off: "bg-[#5a5a5a]",
  warn: "bg-destructive",
  info: "bg-[#69c1fc]",
}

const TONE_TEXT: Record<HealthRow["tone"], string> = {
  good: "text-success",
  off: "text-subtle-foreground",
  warn: "text-destructive",
  info: "text-[#69c1fc]",
}

function Health({ overview, now }: { overview: Overview; now: number }) {
  const { flags, video, backfill, compilation } = overview.health
  const rows: HealthRow[] = flags.map((flag) => ({
    label: flagName(flag.key).replace(/^the /, "").replace(/^./, (c) => c.toUpperCase()),
    sub: FLAG_HELP[flag.key] ?? "",
    state: flag.enabled ? "On" : "Off",
    // Turning a kill switch off is worth noticing; the Roblox requirement
    // being off is the normal state.
    tone: flag.enabled ? "good" : flag.key === "require_roblox_link" ? "off" : "warn",
  }))

  rows.push({
    label: "Video processing",
    sub: [
      video.processing === 1 ? "1 processing now" : `${formatCount(video.processing)} processing now`,
      video.avg_seconds_24h === null ? null : `average ${formatDuration(video.avg_seconds_24h)}`,
      video.failed_7d > 0 ? `${video.failed_7d} failed this week` : null,
    ]
      .filter(Boolean)
      .join(", "),
    state: video.failed_7d > 0 ? "Some failed" : "Healthy",
    tone: video.failed_7d > 0 ? "warn" : "good",
  })

  if (backfill.started && backfill.remaining > 0) {
    rows.push({
      label: "Re-encoding old videos",
      sub: `${formatCount(backfill.remaining)} left, ${backfill.inFlight} in progress`,
      state: "Running",
      tone: "info",
    })
  }

  if (compilation) {
    const failed = compilation.status === "failed"
    const done = compilation.status === "done"
    rows.push({
      label: "WR compilation",
      sub: `${compilation.title}, ${done ? `finished ${formatAgo(compilation.finished_at, now)}` : `started ${formatAgo(compilation.created_at, now)}`}`,
      state: failed ? "Failed" : done ? "Done" : "Rendering",
      tone: failed ? "warn" : done ? "good" : "info",
    })
  }

  return (
    <AdminSection title="Site health">
      <div className="rounded-lg border border-line bg-surface">
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <li key={row.label} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2.5">
              <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[row.tone])} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px]">{row.label}</span>
                <span className="line-clamp-2 text-[13px] text-muted-foreground">{row.sub}</span>
              </span>
              <span className={cn("label-caps shrink-0 text-[13px]", TONE_TEXT[row.tone])}>{row.state}</span>
            </li>
          ))}
        </ul>
        <Link href="/admin/site" className="label-caps flex h-11 items-center gap-1 px-4 text-[13px] text-muted-foreground hover:text-foreground">
          Switches and maintenance
          <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
    </AdminSection>
  )
}

function changeText(current: number, previous: number) {
  if (previous === 0) return current === 0 ? { text: "no change", tone: "flat" as const } : { text: "up from 0", tone: "up" as const }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { text: "no change", tone: "flat" as const }
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, tone: pct > 0 ? ("up" as const) : ("down" as const) }
}

function Activity({ overview, period, onPeriod }: { overview: Overview; period: 7 | 30; onPeriod: (period: 7 | 30) => void }) {
  const { current, previous, series, climbers } = overview.activity
  const shownPeriod = overview.period_days

  return (
    <AdminSection
      title="Activity"
      actions={
        <div role="group" aria-label="Period" className="-my-1.5 flex rounded-md border border-line p-0.5">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={period === days}
              onClick={() => onPeriod(days)}
              className={cn(
                "label-caps h-8 rounded-[5px] px-3 text-[13px]",
                period === days ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {days} days
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
        {STATS.map((stat) => {
          const change = changeText(current[stat.key], previous[stat.key])
          const values = series[stat.key]
          const max = Math.max(1, ...values)
          return (
            <div key={stat.key} className="flex flex-col gap-2 bg-surface p-4">
              <span className="label-caps text-[13px] text-subtle-foreground">{stat.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="num text-[30px] font-semibold leading-none">{formatCount(current[stat.key])}</span>
                <span
                  className={cn(
                    "num text-[13px]",
                    change.tone === "up" ? "text-success" : change.tone === "down" ? "text-destructive" : "text-subtle-foreground"
                  )}
                >
                  {change.text}
                  <span className="sr-only"> compared with the {shownPeriod} days before</span>
                </span>
              </span>
              <span className="flex h-9 items-end gap-[2px]" aria-hidden>
                {values.map((value, index) => (
                  <span
                    key={index}
                    title={`${value} ${index === values.length - 1 ? "today" : `${values.length - 1 - index}d ago`}`}
                    className={cn("min-w-0 flex-1 rounded-t-[2px]", index === values.length - 1 ? "bg-primary" : "bg-[#3a3a3a]")}
                    style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
                  />
                ))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="rounded-lg border border-line bg-surface">
        <h3 className="label-caps border-b border-line px-4 py-3 text-[13px] text-subtle-foreground">Biggest climbers, {shownPeriod} days</h3>
        {climbers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nobody’s score went up in this period.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {climbers.map((climber) => (
              <li key={climber.player_uuid} className="flex h-11 items-center gap-3 border-b border-line px-4 last:border-b-0">
                <Link href={`/players/${encodeURIComponent(climber.player_uuid)}`} className="min-w-0 flex-1 truncate text-[15px] hover:underline">
                  {climber.player_name}
                </Link>
                <span className="num text-[14px] text-success">+{climber.score_change.toFixed(3)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AdminSection>
  )
}
