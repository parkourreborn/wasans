"use client"

import { useState } from "react"
import Link from "next/link"
import { formatCount } from "@/lib/format"
import { mean, quantile, stddev, type AnalyticsBucket, type SeriesPoint } from "@/lib/analytics"
import { cn } from "@/lib/utils"

// The chart kit for /analytics. Everything is plain HTML and SVG drawn in
// the site's tokens (no chart library), in the same style as the profile's
// history chart: recessive grid, thin marks, a hover read-out on every
// mark. Multi-series charts always carry a legend and list every value in
// their tooltip, since pink and blue sit close together for some colour
// vision.

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"] as const

export function niceStep(span: number, target: number) {
  if (!(span > 0)) return 1
  const raw = span / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

function ticksFor(lo: number, hi: number, target: number) {
  const step = niceStep(hi - lo, target)
  const ticks: number[] = []
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-6; value += step) ticks.push(Number(value.toFixed(6)))
  return ticks
}

const dayLabel = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
const monthName = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" })
// "Oct ’25": a bare "Oct 25" reads as a day.
const monthLabel = { format: (date: Date) => `${monthName.format(date)} ’${String(date.getUTCFullYear()).slice(2)}` }
const fullDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const fullMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" })

export function bucketLabel(t: number, bucket: AnalyticsBucket, long = false) {
  const date = new Date(t * 1000)
  if (bucket === "month") return long ? fullMonth.format(date) : monthLabel.format(date)
  if (bucket === "week") return long ? `Week of ${fullDay.format(date)}` : dayLabel.format(date)
  return long ? fullDay.format(date) : dayLabel.format(date)
}

export function Card({
  title,
  description,
  aside,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="label-caps text-[15px] text-foreground">{title}</h3>
          {description ? <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 lg:grid-cols-6", className)}>
      {children}
    </div>
  )
}

// One number. `delta` compares it to the previous period of the same length.
export function Stat({
  label,
  value,
  sub,
  delta,
  tone,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  delta?: { current: number; previous: number } | null
  tone?: "gold" | "muted" | "warn"
}) {
  let change: React.ReactNode = null
  if (delta && delta.previous > 0) {
    const pct = ((delta.current - delta.previous) / delta.previous) * 100
    const rounded = Math.round(pct)
    change = (
      <span className={cn("num text-[12px]", rounded > 0 ? "text-success" : rounded < 0 ? "text-destructive" : "text-subtle-foreground")}>
        {rounded > 0 ? "▲" : rounded < 0 ? "▼" : ""} {rounded === 0 ? "no change" : `${Math.abs(rounded)}%`}
      </span>
    )
  } else if (delta && delta.previous === 0 && delta.current > 0) {
    change = <span className="text-[12px] text-subtle-foreground">none before</span>
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="label-caps truncate text-[12px] text-subtle-foreground">{label}</span>
      <span
        className={cn(
          "num truncate text-[22px] font-semibold",
          tone === "gold" && "text-gold",
          tone === "muted" && "text-subtle-foreground",
          tone === "warn" && "text-destructive"
        )}
      >
        {value}
      </span>
      {sub || change ? (
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          {change}
          {sub}
        </span>
      ) : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  size?: "sm" | "md"
}) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-0.5 rounded-md border border-line-strong p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "label-caps rounded px-2.5 transition-colors",
            size === "sm" ? "h-6 text-[12px]" : "h-7 text-[13px]",
            value === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("inline-block h-0 w-3.5 border-t-2", item.dashed && "border-dashed")}
            style={{ borderColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ left, children }: { left: number; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1 z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[12px]",
        left > 60 ? "-translate-x-[calc(100%+10px)]" : "translate-x-2.5"
      )}
      style={{ left: `${left}%` }}
    >
      {children}
    </span>
  )
}

function useHoverIndex(count: number) {
  const [hover, setHover] = useState<number | null>(null)
  const track = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || count === 0) return
    const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width))
    setHover(Math.floor(ratio * count))
  }
  const handlers = {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => track(event.clientX, event.currentTarget),
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => track(event.clientX, event.currentTarget),
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") setHover(null)
    },
  }
  return { hover, handlers }
}

function Empty({ children, height = 180 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-sm text-muted-foreground" style={{ height }}>
      {children}
    </div>
  )
}

export type Marker = { value: number; label: string; color: string; dashed?: boolean }

// A histogram of `values` with a normal curve fitted to them, the middle
// half shaded and labelled markers on top (WR, median, you). `clipHigh`
// trims a long slow tail so the bulk of the field stays readable; what was
// cut is said underneath.
export function DistributionChart({
  values,
  markers = [],
  format,
  domain,
  clipHigh = false,
  showCurve = true,
  unitLabel,
  height = 220,
}: {
  values: readonly number[]
  markers?: Marker[]
  format: (value: number) => string
  domain?: [number, number]
  clipHigh?: boolean
  showCurve?: boolean
  unitLabel: string
  height?: number
}) {
  const sorted = [...values].sort((a, b) => a - b)
  const binCount = Math.max(8, Math.min(40, Math.round(Math.sqrt(sorted.length) * 1.6)))
  let lo = domain?.[0] ?? sorted[0]
  let hi = domain?.[1] ?? (clipHigh && sorted.length > 20 ? quantile(sorted, 0.97) : sorted[sorted.length - 1])
  if (!(hi > lo)) {
    lo -= 0.5
    hi += 0.5
  }
  const width = (hi - lo) / binCount
  const bins = Array.from({ length: binCount }, (_, index) => ({ from: lo + index * width, to: lo + (index + 1) * width, count: 0 }))
  let beyond = 0
  for (const value of sorted) {
    if (value > hi + 1e-9) {
      beyond += 1
      continue
    }
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - lo) / width)))
    bins[index].count += 1
  }
  const { hover, handlers } = useHoverIndex(binCount)

  if (sorted.length === 0) return <Empty height={height}>No times on this trial yet.</Empty>

  const average = mean(sorted)
  const spread = stddev(sorted, average)
  const curveAt = (x: number) =>
    spread > 0 ? ((sorted.length * width) / (spread * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - average) ** 2) / (2 * spread ** 2)) : 0
  const peak = Math.max(...bins.map((bin) => bin.count), showCurve ? curveAt(average) : 0, 1)
  const x = (value: number) => ((value - lo) / (hi - lo)) * 100
  const y = (count: number) => 100 - (count / peak) * 92

  let curve = ""
  if (showCurve && spread > 0) {
    for (let step = 0; step <= 80; step += 1) {
      const value = lo + ((hi - lo) * step) / 80
      curve += `${step === 0 ? "M" : " L"}${x(value).toFixed(2)} ${y(curveAt(value)).toFixed(2)}`
    }
  }

  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const visibleMarkers = markers.filter((marker) => Number.isFinite(marker.value) && marker.value >= lo - 1e-9 && marker.value <= hi + 1e-9)
  // Each label goes in the highest row with room for it, left to right, so
  // labels on close markers stack instead of overlapping.
  const rowEnds: number[] = []
  const labelRow = new Map<Marker, number>()
  for (const marker of [...visibleMarkers].sort((a, b) => a.value - b.value)) {
    const left = x(marker.value)
    const width = 2 + marker.label.length * 1.1
    let row = rowEnds.findIndex((end) => end < left)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = left + width
    labelRow.set(marker, row)
  }
  const hovered = hover === null ? null : bins[hover]

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div className="relative" style={{ height }}>
        {ticksFor(0, peak, 3).map((tick) => (
          <div key={tick} className="absolute inset-x-0 flex h-0 items-center" style={{ top: `${y(tick)}%` }}>
            <span className="h-px flex-1 bg-[#1f1f1f]" />
          </div>
        ))}
        <div
          aria-hidden
          className="absolute inset-y-0 bg-foreground/[0.04]"
          style={{ left: `${Math.max(0, x(q1))}%`, width: `${Math.max(0, Math.min(100, x(q3)) - Math.max(0, x(q1)))}%` }}
        />
        {bins.map((bin, index) => (
          <div
            key={index}
            aria-hidden
            className={cn("absolute bottom-0 rounded-t-[2px] transition-opacity", hover !== null && hover !== index ? "opacity-45" : "")}
            style={{
              left: `calc(${(index / binCount) * 100}% + 1px)`,
              width: `calc(${100 / binCount}% - 2px)`,
              height: `${bin.count ? Math.max(1.5, 100 - y(bin.count)) : 0}%`,
              background: "color-mix(in oklab, var(--primary) 70%, var(--surface))",
            }}
          />
        ))}
        {curve ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <path d={curve} fill="none" stroke="var(--foreground)" strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {visibleMarkers.map((marker, index) => (
          <div key={`${marker.label}-${index}`} className="pointer-events-none absolute inset-y-0" style={{ left: `${x(marker.value)}%` }}>
            <span className={cn("absolute inset-y-0 -translate-x-1/2 border-l-2", marker.dashed && "border-dashed")} style={{ borderColor: marker.color }} />
            <span
              className="label-caps absolute left-1 whitespace-nowrap rounded-sm bg-surface px-1 text-[11px]"
              style={{ color: marker.color, top: `${4 + (labelRow.get(marker) ?? 0) * 16}px` }}
            >
              {marker.label}
            </span>
          </div>
        ))}
        {hovered ? (
          <Tooltip left={((hover! + 0.5) / binCount) * 100}>
            <span className="text-muted-foreground">
              {format(hovered.from)} – {format(hovered.to)}
            </span>
            <span className="num text-[14px] font-semibold">
              {formatCount(hovered.count)} {hovered.count === 1 ? "player" : "players"}
            </span>
            <span className="num text-muted-foreground">{((hovered.count / sorted.length) * 100).toFixed(1)}% of the field</span>
          </Tooltip>
        ) : null}
        <div className="absolute inset-0 cursor-crosshair touch-pan-y" {...handlers} />
      </div>
      <div aria-hidden className="relative h-4 border-t border-line-strong">
        {ticksFor(lo, hi, 6).map((tick) => (
          <span key={tick} className="num absolute top-0.5 -translate-x-1/2 text-[11px] text-subtle-foreground" style={{ left: `${x(tick)}%` }}>
            {format(tick)}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap justify-between gap-2 pt-1 text-[12px] text-subtle-foreground">
        <span>
          {unitLabel}. Shaded: the middle half ({format(q1)} – {format(q3)}).
          {showCurve ? " Line: a normal curve fitted to the field." : ""}
        </span>
        {beyond > 0 ? <span>{formatCount(beyond)} slower off the right edge</span> : null}
      </figcaption>
    </figure>
  )
}

export type ColumnSeries = { key: string; label: string; color: string; points: SeriesPoint[] }

// Columns over time, one per bucket, stacked when there's more than one
// series. Hover reads every series in the bucket.
export function ColumnChart({
  series,
  bucket,
  format = formatCount,
  height = 180,
  empty = "Nothing in this range.",
}: {
  series: ColumnSeries[]
  bucket: AnalyticsBucket
  format?: (value: number) => string
  height?: number
  empty?: string
}) {
  const length = series[0]?.points.length ?? 0
  const { hover, handlers } = useHoverIndex(length)
  const totals = Array.from({ length }, (_, index) => series.reduce((sum, item) => sum + (item.points[index]?.v ?? 0), 0))
  const max = Math.max(...totals, 0)
  if (length === 0 || max === 0) return <Empty height={height}>{empty}</Empty>

  const ticks = ticksFor(0, max, 4)
  const top = Math.max(max, ticks[ticks.length - 1] ?? max)
  const labelStride = Math.max(1, Math.ceil(length / 7))
  const gap = length > 60 ? 0 : 2

  return (
    <figure className="m-0 flex flex-col gap-1">
      {series.length > 1 ? <Legend items={series.map((item) => ({ label: item.label, color: item.color }))} /> : null}
      <div className="relative ml-10" style={{ height }}>
        {ticks.map((tick) => (
          <div key={tick} className="absolute -left-10 right-0 flex h-0 items-center" style={{ bottom: `${(tick / top) * 100}%` }}>
            <span className="num mr-2 w-8 shrink-0 text-right text-[11px] text-subtle-foreground">{format(tick)}</span>
            <span className="h-px flex-1 bg-[#1f1f1f]" />
          </div>
        ))}
        {Array.from({ length }, (_, index) => {
          let offset = 0
          return (
            <div
              key={index}
              aria-hidden
              className={cn("absolute bottom-0 flex flex-col-reverse transition-opacity", hover !== null && hover !== index ? "opacity-45" : "")}
              style={{ left: `calc(${(index / length) * 100}% + ${gap / 2}px)`, width: `calc(${100 / length}% - ${gap}px)`, height: "100%" }}
            >
              {series.map((item, seriesIndex) => {
                const value = item.points[index]?.v ?? 0
                if (!value) return null
                const segment = (
                  <span
                    key={item.key}
                    className={cn("block w-full", seriesIndex === series.length - 1 || offset + value === totals[index] ? "rounded-t-[2px]" : "")}
                    style={{
                      height: `${(value / top) * 100}%`,
                      minHeight: 2,
                      background: item.color,
                      marginTop: offset > 0 && series.length > 1 ? 2 : 0,
                    }}
                  />
                )
                offset += value
                return segment
              })}
            </div>
          )
        })}
        {hover !== null ? (
          <Tooltip left={((hover + 0.5) / length) * 100}>
            <span className="text-muted-foreground">{bucketLabel(series[0].points[hover].t, bucket, true)}</span>
            {series.map((item) => (
              <span key={item.key} className="flex items-center gap-2">
                {series.length > 1 ? <span aria-hidden className="size-2 rounded-[2px]" style={{ background: item.color }} /> : null}
                {series.length > 1 ? <span className="text-muted-foreground">{item.label}</span> : null}
                <span className="num ml-auto text-[14px] font-semibold">{format(item.points[hover]?.v ?? 0)}</span>
              </span>
            ))}
          </Tooltip>
        ) : null}
        <div className="absolute inset-0 cursor-crosshair touch-pan-y" {...handlers} />
      </div>
      <div aria-hidden className="relative ml-10 h-4">
        {series[0].points.map((point, index) =>
          index % labelStride === 0 ? (
            <span
              key={point.t}
              className="num absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-subtle-foreground"
              style={{ left: `${((index + 0.5) / length) * 100}%` }}
            >
              {bucketLabel(point.t, bucket)}
            </span>
          ) : null
        )}
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Period</th>
            {series.map((item) => (
              <th key={item.key}>{item.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series[0].points.map((point, index) => (
            <tr key={point.t}>
              <td>{bucketLabel(point.t, bucket, true)}</td>
              {series.map((item) => (
                <td key={item.key}>{format(item.points[index]?.v ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export type LineSeries = { key: string; label: string; color: string; points: SeriesPoint[]; dashed?: boolean }

// Lines on one shared axis (never two). `invert` puts low values on top,
// for times where lower is better.
export function LineChart({
  series,
  bucket,
  format,
  invert = false,
  height = 200,
}: {
  series: LineSeries[]
  bucket: AnalyticsBucket
  format: (value: number) => string
  invert?: boolean
  height?: number
}) {
  const length = series[0]?.points.length ?? 0
  const { hover, handlers } = useHoverIndex(length)
  const values = series.flatMap((item) => item.points.map((point) => point.v)).filter(Number.isFinite)
  if (length === 0 || values.length === 0) return <Empty height={height}>Not enough runs yet.</Empty>

  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (hi - lo < 1e-6) {
    lo -= 0.5
    hi += 0.5
  }
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const x = (index: number) => (length === 1 ? 50 : (index / (length - 1)) * 100)
  const y = (value: number) => {
    const ratio = (value - lo) / (hi - lo)
    return invert ? 4 + ratio * 92 : 96 - ratio * 92
  }
  const labelStride = Math.max(1, Math.ceil(length / 7))
  const hoverX = hover === null ? null : x(hover)

  return (
    <figure className="m-0 flex flex-col gap-1">
      <Legend items={series.map((item) => ({ label: item.label, color: item.color, dashed: item.dashed }))} />
      <div className="relative ml-12" style={{ height }}>
        {ticksFor(lo, hi, 4).map((tick) => (
          <div key={tick} className="absolute -left-12 right-0 flex h-0 items-center" style={{ top: `${y(tick)}%` }}>
            <span className="num mr-2 w-10 shrink-0 text-right text-[11px] text-subtle-foreground">{format(tick)}</span>
            <span className="h-px flex-1 bg-[#1f1f1f]" />
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          {series.map((item) => {
            let path = ""
            item.points.forEach((point, index) => {
              if (!Number.isFinite(point.v)) return
              path += `${path ? " L" : "M"}${x(index).toFixed(2)} ${y(point.v).toFixed(2)}`
            })
            return (
              <path
                key={item.key}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeDasharray={item.dashed ? "4 3" : undefined}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
        {hover !== null && hoverX !== null ? (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-[#5a5a5a]" style={{ left: `${hoverX}%` }} />
            {series.map((item) =>
              Number.isFinite(item.points[hover]?.v) ? (
                <span
                  key={item.key}
                  aria-hidden
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{ left: `${hoverX}%`, top: `${y(item.points[hover].v)}%`, background: item.color }}
                />
              ) : null
            )}
            <Tooltip left={hoverX}>
              <span className="text-muted-foreground">{bucketLabel(series[0].points[hover].t, bucket, true)}</span>
              {series.map((item) => (
                <span key={item.key} className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="num ml-auto text-[14px] font-semibold">
                    {Number.isFinite(item.points[hover]?.v) ? format(item.points[hover].v) : "—"}
                  </span>
                </span>
              ))}
            </Tooltip>
          </>
        ) : null}
        <div className="absolute inset-0 cursor-crosshair touch-pan-y" {...handlers} />
      </div>
      <div aria-hidden className="relative ml-12 h-4">
        {series[0].points.map((point, index) =>
          index % labelStride === 0 ? (
            <span key={point.t} className="num absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-subtle-foreground" style={{ left: `${x(index)}%` }}>
              {bucketLabel(point.t, bucket)}
            </span>
          ) : null
        )}
      </div>
    </figure>
  )
}

export type BarRow = {
  key: string
  label: React.ReactNode
  value: number
  display?: string
  sub?: React.ReactNode
  href?: string
  color?: string
  // A second part of the bar (e.g. denied next to approved).
  second?: { value: number; color: string; label: string }
}

// Ranked horizontal bars with the value on the right: the form for
// comparing named things (trials, players, providers).
export function BarList({
  rows,
  format = formatCount,
  max,
  empty = "Nothing yet.",
  limit,
}: {
  rows: BarRow[]
  format?: (value: number) => string
  max?: number
  empty?: string
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  if (rows.length === 0) return <p className="m-0 text-sm text-muted-foreground">{empty}</p>
  const top = max ?? Math.max(...rows.map((row) => row.value + (row.second?.value ?? 0)), 1e-9)
  const shown = limit && !expanded ? rows.slice(0, limit) : rows

  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((row) => {
          const total = row.value + (row.second?.value ?? 0)
          const label = row.href ? (
            <Link href={row.href} className="truncate hover:underline hover:underline-offset-4">
              {row.label}
            </Link>
          ) : (
            <span className="truncate">{row.label}</span>
          )
          return (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="flex min-w-0 items-baseline gap-2">
                  {label}
                  {row.sub ? <span className="shrink-0 truncate text-[12px] text-subtle-foreground">{row.sub}</span> : null}
                </span>
                <span className="num shrink-0">{row.display ?? format(total)}</span>
              </div>
              <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(0, (row.value / top) * 100)}%`, background: row.color ?? "var(--primary)" }}
                />
                {row.second && row.second.value > 0 ? (
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(row.second.value / top) * 100}%`, background: row.second.color }}
                    title={`${row.second.label}: ${format(row.second.value)}`}
                  />
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {limit && rows.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="label-caps self-start text-[12px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  )
}

// Columns for a small set of ordered categories (e.g. "trials with a PB":
// 1, 2, 3...), with the count over each.
export function CategoryColumns({
  rows,
  height = 150,
  color = "var(--primary)",
  format = formatCount,
}: {
  rows: Array<{ key: string; label: string; value: number; color?: string; note?: string }>
  height?: number
  color?: string
  format?: (value: number) => string
}) {
  const { hover, handlers } = useHoverIndex(rows.length)
  const max = Math.max(...rows.map((row) => row.value), 1)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const labelStride = Math.max(1, Math.ceil(rows.length / 14))

  return (
    <figure className="m-0 flex flex-col gap-1">
      <div className="relative" style={{ height }}>
        {rows.map((row, index) => (
          <div
            key={row.key}
            aria-hidden
            className={cn("absolute bottom-0 rounded-t-[2px] transition-opacity", hover !== null && hover !== index ? "opacity-45" : "")}
            style={{
              left: `calc(${(index / rows.length) * 100}% + 1px)`,
              width: `calc(${100 / rows.length}% - 2px)`,
              height: `${row.value ? Math.max(1.5, (row.value / max) * 92) : 0}%`,
              background: row.color ?? color,
            }}
          />
        ))}
        {hover !== null && rows[hover] ? (
          <Tooltip left={((hover + 0.5) / rows.length) * 100}>
            <span className="text-muted-foreground">{rows[hover].note ?? rows[hover].label}</span>
            <span className="num text-[14px] font-semibold">{format(rows[hover].value)}</span>
            {total > 0 ? <span className="num text-muted-foreground">{((rows[hover].value / total) * 100).toFixed(1)}%</span> : null}
          </Tooltip>
        ) : null}
        <div className="absolute inset-0 cursor-crosshair touch-pan-y" {...handlers} />
      </div>
      <div aria-hidden className="relative h-4 border-t border-line-strong">
        {rows.map((row, index) =>
          index % labelStride === 0 ? (
            <span
              key={row.key}
              className="num absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] text-subtle-foreground"
              style={{ left: `${((index + 0.5) / rows.length) * 100}%` }}
            >
              {row.label}
            </span>
          ) : null
        )}
      </div>
      <table className="sr-only">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.note ?? row.label}</td>
              <td>{format(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// When runs come in: weekday by hour, shifted from UTC to the viewer's own
// time zone (to the nearest hour).
export function WeekHourHeatmap({ grid, offsetHours }: { grid: number[][]; offsetHours: number }) {
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null)
  const local = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const shifted = day * 24 + hour + offsetHours
      const index = ((shifted % 168) + 168) % 168
      local[Math.floor(index / 24)][index % 24] += grid[day]?.[hour] ?? 0
    }
  }
  const max = Math.max(...local.flat(), 1)
  const total = local.flat().reduce((sum, value) => sum + value, 0)
  if (total === 0) return <Empty height={160}>No runs in this range.</Empty>

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]" onPointerLeave={() => setHover(null)}>
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="num text-center text-[10px] text-subtle-foreground">
              {hour % 3 === 0 ? hour : ""}
            </span>
          ))}
          {local.map((row, day) => (
            <div key={day} className="contents">
              <span className="label-caps flex items-center text-[11px] text-subtle-foreground">{WEEKDAYS[day]}</span>
              {row.map((value, hour) => (
                <span
                  key={hour}
                  onPointerEnter={() => setHover({ day, hour })}
                  onPointerDown={() => setHover({ day, hour })}
                  className={cn("aspect-square rounded-[2px]", hover?.day === day && hover.hour === hour && "ring-1 ring-foreground")}
                  style={{
                    background: value
                      ? `color-mix(in oklab, var(--primary) ${Math.round(15 + (value / max) * 85)}%, var(--surface-3))`
                      : "var(--surface-2)",
                  }}
                  title={`${WEEKDAYS[day]} ${String(hour).padStart(2, "0")}:00 · ${formatCount(value)} runs`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 min-h-[18px] text-[12px] text-muted-foreground">
        {hover ? (
          <>
            {WEEKDAYS[hover.day]} {String(hover.hour).padStart(2, "0")}:00–{String((hover.hour + 1) % 24).padStart(2, "0")}:00:{" "}
            <span className="num text-foreground">{formatCount(local[hover.day][hover.hour])}</span> runs (
            {((local[hover.day][hover.hour] / total) * 100).toFixed(1)}%)
          </>
        ) : (
          "Your local time. Darker means more runs submitted."
        )}
      </p>
    </div>
  )
}

// A trial-by-trial grid of correlations: pink where players good at one are
// good at the other, blue where the opposite, grey near zero.
export function CorrelationGrid({
  trials,
  matrix,
  samples,
  onPick,
}: {
  trials: string[]
  matrix: Array<Array<number | null>>
  samples: number[][]
  onPick?: (trial: string) => void
}) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  if (trials.length < 2) return <Empty height={160}>Needs at least two trials with five or more players.</Empty>
  const short = (name: string) => (name.length > 7 ? `${name.slice(0, 6)}…` : name)
  const cell = (r: number | null) => {
    if (r == null) return "var(--surface-2)"
    const strength = Math.round(Math.min(1, Math.abs(r)) * 85)
    return `color-mix(in oklab, ${r >= 0 ? "var(--chart-1)" : "var(--chart-2)"} ${strength}%, var(--surface-3))`
  }
  const active = hover ? { a: trials[hover.row], b: trials[hover.col], r: matrix[hover.row][hover.col], n: samples[hover.row][hover.col] } : null

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `5rem repeat(${trials.length}, minmax(13px, 1fr))`, minWidth: `${80 + trials.length * 15}px` }}
          onPointerLeave={() => setHover(null)}
        >
          <span />
          {trials.map((trial, col) => (
            <span
              key={trial}
              className={cn("flex h-16 items-end justify-center text-[10px] text-subtle-foreground [writing-mode:vertical-rl] rotate-180", hover?.col === col && "text-foreground")}
            >
              {short(trial)}
            </span>
          ))}
          {trials.map((trial, row) => (
            <div key={trial} className="contents">
              <button
                type="button"
                onClick={() => onPick?.(trial)}
                className={cn("truncate pr-1 text-left text-[11px] text-subtle-foreground hover:text-foreground", hover?.row === row && "text-foreground")}
              >
                {trial}
              </button>
              {matrix[row].map((value, col) => (
                <span
                  key={col}
                  onPointerEnter={() => setHover({ row, col })}
                  onPointerDown={() => setHover({ row, col })}
                  className={cn("aspect-square rounded-[2px]", hover?.row === row && hover.col === col && "ring-1 ring-foreground")}
                  style={{ background: row === col ? "var(--line-strong)" : cell(value) }}
                  title={row === col ? trial : `${trial} × ${trials[col]}: ${value == null ? "too few players" : `r = ${value.toFixed(2)}`}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="min-h-[18px]">
          {active && active.a !== active.b ? (
            <>
              {active.a} × {active.b}:{" "}
              {active.r == null ? (
                "too few players on both"
              ) : (
                <>
                  <span className="num text-foreground">r = {active.r.toFixed(2)}</span> over {formatCount(active.n)} players
                </>
              )}
            </>
          ) : (
            "Hover a square to compare two trials."
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span>−1</span>
          <span
            aria-hidden
            className="h-2 w-28 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--chart-2), var(--surface-3), var(--chart-1))" }}
          />
          <span>+1</span>
        </span>
      </div>
    </div>
  )
}
