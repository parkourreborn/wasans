"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { quantile, type AnalyticsRange, type SeriesPoint, type TrialAnalytics } from "@/lib/analytics"
import { formatAge, formatCount, formatDate, formatScore, formatTime } from "@/lib/format"
import { trialHref } from "@/lib/trial-slug"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { HistoryChart } from "@/components/site/profile/history-chart"
import { TrialCombobox } from "@/components/site/trial-combobox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarList,
  Card,
  ColumnChart,
  DistributionChart,
  LineChart,
  Segmented,
  Stat,
  StatGrid,
  type BarRow,
  type Marker,
} from "./charts"
import { formatPct, formatSeconds, scoreFor, standing, type DerivedTrial } from "./analytics-data"

export type Overlay = { uuid: string; name: string; color: string; pbs: ReadonlyMap<string, number> }
export type Unit = "time" | "score"

type SortKey = "order" | "players" | "wr" | "median" | "gap" | "medianGap" | "score" | "age" | "changes" | "active"

const SORTS: Array<{ key: SortKey; label: string; className?: string; value: (trial: DerivedTrial) => number | null; desc?: boolean }> = [
  { key: "players", label: "Players", value: (trial) => trial.count, desc: true },
  { key: "wr", label: "WR", value: (trial) => trial.wr?.time ?? null, className: "hidden md:table-cell" },
  { key: "median", label: "Median", value: (trial) => (trial.count ? trial.median : null) },
  { key: "gap", label: "WR → #2", value: (trial) => trial.gapSecondPct, className: "hidden lg:table-cell" },
  { key: "medianGap", label: "WR → median", value: (trial) => trial.gapMedianPct, className: "hidden md:table-cell" },
  { key: "score", label: "Avg score", value: (trial) => (trial.count ? trial.meanScore : null), className: "hidden sm:table-cell" },
  { key: "active", label: "Runs", value: (trial) => trial.approved, desc: true, className: "hidden lg:table-cell" },
  { key: "age", label: "WR age", value: (trial) => trial.wrAgeDays, desc: true, className: "hidden lg:table-cell" },
  { key: "changes", label: "WRs", value: (trial) => trial.wr_changes + (trial.wr ? 1 : 0), desc: true, className: "hidden xl:table-cell" },
]

// Every trial in one table, sortable, each row opening its deep dive.
export function TrialsTable({
  trials,
  selected,
  onSelect,
  rangeLabel,
}: {
  trials: DerivedTrial[]
  selected: string
  onSelect: (trial: string) => void
  rangeLabel: string
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "order", desc: false })
  const column = SORTS.find((entry) => entry.key === sort.key)
  const rows = column
    ? [...trials].sort((a, b) => {
        const av = column.value(a)
        const bv = column.value(b)
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return sort.desc ? bv - av : av - bv
      })
    : trials

  const toggle = (key: SortKey) => {
    const entry = SORTS.find((item) => item.key === key)
    setSort((current) =>
      current.key === key ? (current.desc === Boolean(entry?.desc) ? { key, desc: !current.desc } : { key: "order", desc: false }) : { key, desc: Boolean(entry?.desc) }
    )
  }

  return (
    <Card
      title="Every trial"
      description={`Current PBs on each trial. Runs counts approved runs over the last ${rangeLabel.toLowerCase()}. Click a heading to sort, a trial to dig in.`}
    >
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full min-w-[420px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label-caps py-2 pl-4 pr-2 text-[12px] font-semibold text-subtle-foreground md:pl-5">
                <button type="button" onClick={() => setSort({ key: "order", desc: false })} className="hover:text-foreground">
                  Trial
                </button>
              </th>
              {SORTS.map((entry) => (
                <th key={entry.key} className={cn("label-caps px-2 py-2 text-right text-[12px] font-semibold text-subtle-foreground", entry.className)}>
                  <button
                    type="button"
                    onClick={() => toggle(entry.key)}
                    aria-sort={sort.key === entry.key ? (sort.desc ? "descending" : "ascending") : undefined}
                    className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === entry.key && "text-foreground")}
                  >
                    {entry.label}
                    {sort.key === entry.key ? sort.desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((trial) => (
              <tr
                key={trial.trial_name}
                onClick={() => onSelect(trial.trial_name)}
                className={cn(
                  "cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2",
                  selected === trial.trial_name && "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]"
                )}
              >
                <td className="py-2 pl-4 pr-2 md:pl-5">
                  <button type="button" className="flex flex-col text-left font-medium" onClick={() => onSelect(trial.trial_name)}>
                    {trial.trial_name}
                    {trial.status === "removed" ? <span className="text-[11px] font-normal text-subtle-foreground">Retired</span> : null}
                  </button>
                </td>
                <td className="num px-2 text-right">{formatCount(trial.count)}</td>
                <td className="num hidden px-2 text-right md:table-cell">{formatTime(trial.wr?.time)}</td>
                <td className="num px-2 text-right">{trial.count ? formatTime(trial.median) : "—"}</td>
                <td className="num hidden px-2 text-right lg:table-cell">{formatPct(trial.gapSecondPct, 2)}</td>
                <td className="num hidden px-2 text-right md:table-cell">{formatPct(trial.gapMedianPct)}</td>
                <td className="num hidden px-2 text-right sm:table-cell">{trial.count ? formatScore(trial.meanScore) : "—"}</td>
                <td className="num hidden px-2 text-right lg:table-cell">{formatCount(trial.approved)}</td>
                <td className="num hidden px-2 text-right lg:table-cell">{trial.wrAgeDays == null ? "—" : `${trial.wrAgeDays}d`}</td>
                <td className="num hidden px-2 pr-4 text-right xl:table-cell md:pr-5">{formatCount(trial.wr_changes + (trial.wr ? 1 : 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

type CompareKey = "hardest" | "played" | "active" | "spread" | "close" | "age" | "contested" | "platinum" | "newcomers"

const COMPARE: Array<{
  key: CompareKey
  label: string
  description: string
  value: (trial: DerivedTrial) => number | null
  display: (trial: DerivedTrial) => string
  sub?: (trial: DerivedTrial) => string
  asc?: boolean
}> = [
  {
    key: "hardest",
    label: "Hardest",
    description: "Average trial score across everyone with a PB. Lower means the field is further off the record.",
    value: (trial) => (trial.count ? trial.meanScore : null),
    display: (trial) => formatScore(trial.meanScore),
    sub: (trial) => `median ${formatScore(trial.medianScore)}`,
    asc: true,
  },
  {
    key: "played",
    label: "Most played",
    description: "Players with a PB on the trial.",
    value: (trial) => trial.count,
    display: (trial) => formatCount(trial.count),
  },
  {
    key: "active",
    label: "Busiest",
    description: "Runs submitted in the range, with how many were approved.",
    value: (trial) => trial.submitted,
    display: (trial) => formatCount(trial.submitted),
    sub: (trial) => `${formatCount(trial.approved)} approved · ${formatCount(trial.pbs_set)} PBs`,
  },
  {
    key: "newcomers",
    label: "New players",
    description: "Players whose first approved run on the trial came in the range.",
    value: (trial) => trial.new_players,
    display: (trial) => formatCount(trial.new_players),
  },
  {
    key: "spread",
    label: "Widest spread",
    description: "How spread out trial scores are (standard deviation). Wide means a big skill gap between the top and the rest.",
    value: (trial) => (trial.count > 1 ? trial.scoreSpread : null),
    display: (trial) => trial.scoreSpread.toFixed(3),
  },
  {
    key: "close",
    label: "Closest at the top",
    description: "How far #2 is behind the record, as a share of the WR time.",
    value: (trial) => trial.gapSecondPct,
    display: (trial) => formatPct(trial.gapSecondPct, 2),
    sub: (trial) => (trial.gapSecond != null ? `+${trial.gapSecond.toFixed(3)}s` : ""),
    asc: true,
  },
  {
    key: "age",
    label: "Oldest record",
    description: "Days since the current world record was set.",
    value: (trial) => trial.wrAgeDays,
    display: (trial) => (trial.wrAgeDays == null ? "—" : `${formatCount(trial.wrAgeDays)}d`),
    sub: (trial) => (trial.wr ? `${trial.wr.player_name}, ${formatDate(trial.wr.date)}` : ""),
  },
  {
    key: "contested",
    label: "Most broken",
    description: "How many times the record has changed hands or been lowered, and by how many players.",
    value: (trial) => trial.wr_changes,
    display: (trial) => formatCount(trial.wr_changes),
    sub: (trial) => `${trial.wr_holders} ${trial.wr_holders === 1 ? "holder" : "holders"}`,
  },
  {
    key: "platinum",
    label: "Platinum rate",
    description: "Share of players with a PB at or under the trial's platinum time.",
    value: (trial) => trial.platinumShare,
    display: (trial) => formatPct(trial.platinumShare),
    sub: (trial) => (trial.plat != null ? `plat ${trial.plat.toFixed(2)}` : ""),
  },
]

export function CompareTrials({ trials, analyticsHref }: { trials: DerivedTrial[]; analyticsHref: (trial: string) => string }) {
  const [key, setKey] = useState<CompareKey>("hardest")
  const metric = COMPARE.find((entry) => entry.key === key) ?? COMPARE[0]
  const rows: BarRow[] = trials
    .filter((trial) => metric.value(trial) != null)
    .sort((a, b) => (metric.asc ? metric.value(a)! - metric.value(b)! : metric.value(b)! - metric.value(a)!))
    .map((trial) => ({
      key: trial.trial_name,
      label: trial.trial_name,
      value: Math.max(0, metric.value(trial) ?? 0),
      display: metric.display(trial),
      sub: metric.sub?.(trial),
      href: analyticsHref(trial.trial_name),
    }))
  // "Hardest" and "closest" rank low values first, so draw the bar as the
  // distance from the easiest/widest rather than the raw value.
  const max = Math.max(...rows.map((row) => row.value), 1e-9)

  return (
    <Card title="Trials side by side" description={metric.description}>
      <div className="flex flex-col gap-4">
        <Segmented size="sm" label="Compare by" value={key} options={COMPARE.map((entry) => ({ value: entry.key, label: entry.label }))} onChange={setKey} />
        <BarList rows={rows} max={max} limit={12} empty="No trials have data for this yet." />
      </div>
    </Card>
  )
}

type TrialResponse = { data?: TrialAnalytics }
type Population = "pbs" | "runs"
type Volume = "submitted" | "approved" | "pbs"

const PERCENTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9]

// One trial in depth: its PB distribution with you on it, where the
// percentiles fall, how the record fell and how the field got faster.
export function TrialDeepDive({
  trial,
  trialNames,
  onSelect,
  unit,
  onUnit,
  overlays,
  range,
  rangeLabel,
  now,
}: {
  trial: DerivedTrial
  trialNames: string[]
  onSelect: (trial: string) => void
  unit: Unit
  onUnit: (unit: Unit) => void
  overlays: Overlay[]
  range: AnalyticsRange
  rangeLabel: string
  now: number
}) {
  const [population, setPopulation] = useState<Population>("pbs")
  const [volume, setVolume] = useState<Volume>("approved")
  const detail = useApi<TrialResponse>(`${apiV2(`/analytics/trials/${encodeURIComponent(trial.trial_name)}`)}?range=${range}`)
  const info = detail.data?.data?.trial_name === trial.trial_name ? detail.data.data : undefined

  const wr = trial.wr?.time ?? null
  const toScore = (time: number) => scoreFor(trial.trial_name, wr, time)
  const baseTimes = population === "runs" && info ? info.run_times : trial.times
  const values = unit === "time" ? baseTimes : baseTimes.map(toScore)
  const format = unit === "time" ? (value: number) => value.toFixed(value >= 100 ? 1 : 2) : (value: number) => value.toFixed(2)

  const markers: Marker[] = []
  if (wr != null) markers.push({ value: unit === "time" ? wr : 1, label: "WR", color: "var(--gold)" })
  if (trial.count) {
    markers.push({ value: unit === "time" ? trial.median : trial.medianScore, label: "Median", color: "var(--muted-foreground)", dashed: true })
  }
  if (unit === "time" && trial.plat != null) markers.push({ value: trial.plat, label: "Plat", color: "var(--tier-platinum)", dashed: true })
  for (const overlay of overlays) {
    const time = overlay.pbs.get(trial.trial_name)
    if (time != null) markers.push({ value: unit === "time" ? time : toScore(time), label: overlay.name, color: overlay.color })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <TrialCombobox trials={trialNames} value={trial.trial_name} onValueChange={(value) => value && onSelect(value)} aria-label="Trial" className="w-full sm:w-56" />
        <Segmented
          label="Units"
          value={unit}
          onChange={onUnit}
          options={[
            { value: "time", label: "Time" },
            { value: "score", label: "Score" },
          ]}
        />
        <Segmented
          label="Who"
          value={population}
          onChange={setPopulation}
          options={[
            { value: "pbs", label: "PBs" },
            { value: "runs", label: "Every run" },
          ]}
        />
        <Link href={trialHref(trial.trial_name)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Leaderboard
        </Link>
      </div>

      <StatGrid>
        <Stat label="Players" value={formatCount(trial.count)} sub={`${formatPct(trial.scoringShare, 0)} under bronze`} />
        <Stat
          label="World record"
          value={formatTime(wr)}
          tone="gold"
          sub={trial.wr ? `${trial.wr.player_name} · ${formatAge(trial.wr.date, now)}` : "none yet"}
        />
        <Stat label="Median PB" value={trial.count ? formatTime(trial.median) : "—"} sub={`${formatPct(trial.gapMedianPct)} off the WR`} />
        <Stat label="WR → #2" value={formatSeconds(trial.gapSecond)} sub={formatPct(trial.gapSecondPct, 2)} />
        <Stat label="Top 10 spread" value={formatSeconds(trial.top10Spread)} sub={trial.tenth != null ? `#10 on ${formatTime(trial.tenth)}` : "fewer than 10"} />
        <Stat label="Average score" value={trial.count ? formatScore(trial.meanScore) : "—"} sub={`± ${trial.scoreSpread.toFixed(3)}`} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card
          title={`${trial.trial_name} distribution`}
          description={
            population === "pbs"
              ? `Every player's current PB${unit === "score" ? ", as the trial score it's worth" : ""}.`
              : `Every approved run ever${unit === "score" ? ", scored against today's WR" : ""}, not just PBs.`
          }
        >
          {population === "runs" && !info ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <DistributionChart
              key={`${trial.trial_name}-${unit}-${population}`}
              values={values}
              markers={markers}
              format={format}
              clipHigh={unit === "time"}
              domain={unit === "score" ? [Math.max(0, Math.min(...values, 1) - 0.02), 1] : undefined}
              unitLabel={unit === "time" ? "Seconds, faster on the left" : "Trial score, 0 to 1"}
            />
          )}
        </Card>

        <Card title="Percentiles" description="The time that gets you into each slice of the field.">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="label-caps border-b border-line text-left text-[12px] text-subtle-foreground">
                <th className="py-1.5 font-semibold">Top</th>
                <th className="py-1.5 text-right font-semibold">Time</th>
                <th className="py-1.5 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {trial.count
                ? PERCENTILES.map((q) => {
                    const time = quantile(trial.times, q)
                    return (
                      <tr key={q} className="border-b border-line/60 last:border-0">
                        <td className="num py-1.5">{q === 0.5 ? "50% (median)" : `${q * 100}%`}</td>
                        <td className="num py-1.5 text-right">{formatTime(time)}</td>
                        <td className="num py-1.5 text-right text-muted-foreground">{formatScore(toScore(time))}</td>
                      </tr>
                    )
                  })
                : null}
            </tbody>
          </table>
          {overlays.map((overlay) => (
            <Standing key={overlay.uuid} overlay={overlay} trial={trial} />
          ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Record progression" description="Every time the world record fell, including records from the old WR Drive.">
          {info ? (
            <WrProgression info={info} now={now} />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </Card>
        <Card title="Month by month" description="The best and the median approved run each month. Lines heading up mean the field got faster.">
          {info ? (
            <LineChart
              bucket="month"
              invert
              format={(value) => value.toFixed(2)}
              series={[
                { key: "best", label: "Best run", color: "var(--gold)", points: info.monthly.map((row) => ({ t: row.t, v: row.best })) },
                { key: "median", label: "Median run", color: "var(--chart-1)", points: info.monthly.map((row) => ({ t: row.t, v: row.median })), dashed: true },
              ]}
            />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title={`Runs, last ${rangeLabel.toLowerCase()}`}
          aside={
            <Segmented
              size="sm"
              label="Count"
              value={volume}
              onChange={setVolume}
              options={[
                { value: "submitted", label: "Submitted" },
                { value: "approved", label: "Approved" },
                { value: "pbs", label: "PBs" },
              ]}
            />
          }
        >
          {info ? (
            <ColumnChart bucket={info.bucket} series={[{ key: volume, label: volume, color: "var(--primary)", points: info.volume[volume] as SeriesPoint[] }]} />
          ) : (
            <Skeleton className="h-[200px] w-full" />
          )}
        </Card>
        <Card title="Most runs" description={`Approved runs on ${trial.trial_name}, last ${rangeLabel.toLowerCase()}.`}>
          {info ? (
            <BarList
              rows={info.top_grinders.map((row) => ({
                key: row.player_uuid,
                label: row.player_name,
                value: row.runs,
                sub: `best ${formatTime(row.best)}`,
                href: `/players/${row.player_uuid}`,
              }))}
              empty="No approved runs in this range."
            />
          ) : (
            <Skeleton className="h-[200px] w-full" />
          )}
        </Card>
      </div>

      {info ? (
        <StatGrid>
          <Stat label="Players with a run" value={formatCount(info.grind.players)} sub="approved, all time" />
          <Stat label="Runs per player" value={info.grind.median_runs ? info.grind.median_runs.toFixed(info.grind.median_runs % 1 ? 1 : 0) : "—"} sub="median" />
          <Stat
            label="First run → PB"
            value={info.grind.median_first_to_pb != null ? `−${info.grind.median_first_to_pb.toFixed(3)}s` : "—"}
            sub={info.grind.median_first_to_pb_pct != null ? `median, ${info.grind.median_first_to_pb_pct.toFixed(1)}% faster` : "needs repeat runs"}
          />
          <Stat label="PB age" value={info.grind.median_pb_age_days != null ? `${formatCount(info.grind.median_pb_age_days)}d` : "—"} sub="median" />
          <Stat label="Fresh PBs" value={formatCount(info.grind.pbs_last_30d)} sub="current PBs set in 30 days" />
          <Stat label="Records broken" value={formatCount(trial.wr_changes)} sub={`${trial.wr_holders} ${trial.wr_holders === 1 ? "holder" : "holders"} ever`} />
        </StatGrid>
      ) : null}
    </div>
  )
}

function Standing({ overlay, trial }: { overlay: Overlay; trial: DerivedTrial }) {
  const time = overlay.pbs.get(trial.trial_name)
  if (time == null) {
    return (
      <p className="m-0 border-t border-line pt-3 text-[13px] text-muted-foreground">
        <span style={{ color: overlay.color }}>{overlay.name}</span> has no PB here yet.
      </p>
    )
  }
  const place = standing(trial.times, time)
  const wr = trial.wr?.time ?? null
  // The next slice up from where they are: the widest one they're not in.
  const nextCut = [0.5, 0.25, 0.1, 0.05, 0.01].map((q) => ({ q, time: quantile(trial.times, q) })).find((cut) => cut.time < time)

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
      <span className="label-caps text-[12px]" style={{ color: overlay.color }}>
        {overlay.name}
      </span>
      <span className="text-muted-foreground">
        <span className="num text-foreground">{formatTime(time)}</span>, #{formatCount(place.rank)} of {formatCount(trial.times.length)}, faster than{" "}
        <span className="num text-foreground">{place.beats.toFixed(1)}%</span>
      </span>
      {wr != null ? (
        <span className="text-muted-foreground">
          <span className="num">+{(time - wr).toFixed(3)}s</span> off the WR, worth <span className="num">{formatScore(scoreFor(trial.trial_name, wr, time))}</span>
        </span>
      ) : null}
      {nextCut ? (
        <span className="text-muted-foreground">
          Top {nextCut.q * 100}% needs <span className="num text-foreground">{formatTime(nextCut.time)}</span> (
          <span className="num">−{(time - nextCut.time).toFixed(3)}s</span>)
        </span>
      ) : null}
    </div>
  )
}

function WrProgression({ info, now }: { info: TrialAnalytics; now: number }) {
  const history = info.wr_history
  if (history.length === 0) return <p className="m-0 text-sm text-muted-foreground">No record yet.</p>
  const first = history[0]
  const last = history[history.length - 1]
  const holders = new Map<string, { name: string; count: number; days: number }>()
  history.forEach((row, index) => {
    const until = history[index + 1]?.date ?? now
    const entry = holders.get(row.player_uuid) ?? { name: row.player_name, count: 0, days: 0 }
    entry.count += 1
    entry.days += Math.max(0, (until - row.date) / 86400)
    holders.set(row.player_uuid, entry)
  })
  const longest = [...holders.values()].sort((a, b) => b.days - a.days)[0]

  return (
    <div className="flex flex-col gap-3">
      <HistoryChart
        points={history.map((row) => ({ t: row.date, v: row.time }))}
        invert
        format={(value) => value.toFixed(2)}
        label="World record over time"
        now={now}
      />
      <div className="grid grid-cols-3 gap-3 text-[13px]">
        <div className="flex flex-col">
          <span className="label-caps text-[11px] text-subtle-foreground">Taken off</span>
          <span className="num">{(first.time - last.time).toFixed(3)}s</span>
          <span className="text-[12px] text-muted-foreground">{(((first.time - last.time) / first.time) * 100).toFixed(1)}% since {formatDate(first.date)}</span>
        </div>
        <div className="flex flex-col">
          <span className="label-caps text-[11px] text-subtle-foreground">Records</span>
          <span className="num">{formatCount(history.length)}</span>
          <span className="text-[12px] text-muted-foreground">by {holders.size} {holders.size === 1 ? "player" : "players"}</span>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="label-caps text-[11px] text-subtle-foreground">Held longest</span>
          <span className="truncate">{longest?.name ?? "—"}</span>
          <span className="text-[12px] text-muted-foreground">{longest ? `${formatCount(Math.round(longest.days))} days total` : ""}</span>
        </div>
      </div>
    </div>
  )
}
