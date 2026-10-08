"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export type ChartPoint = { t: number; v: number }

type Line = { value: number; label: string; color: string }

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" })
const dayFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

function niceStep(span: number, target: number) {
  const raw = span / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

// A step chart of rank or score over time: values hold until the next
// change. Rank is drawn upside down so better is up. Hover (or tap) reads
// the value on any day.
export function HistoryChart({
  points,
  invert = false,
  format,
  lines = [],
  label,
  now,
}: {
  points: ChartPoint[]
  invert?: boolean
  format: (value: number) => string
  lines?: Line[]
  label: string
  now: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) {
    return (
      <div className="flex h-[196px] items-center justify-center rounded-md border border-dashed border-line text-sm text-muted-foreground">
        No history yet. It fills in as runs get approved.
      </div>
    )
  }

  const start = points[0].t
  const end = Math.max(now, points[points.length - 1].t)
  const span = Math.max(end - start, 86400)
  const values = points.map((point) => point.v)
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const range = Math.max(vMax - vMin, invert ? 2 : 0.01)
  // Tier lines close to the data are drawn; far-off ones would squash it.
  const visibleLines = lines.filter((line) => line.value >= vMin - range * 0.6 && line.value <= vMax + range * 0.3)
  let lo = Math.min(vMin, ...visibleLines.map((line) => line.value))
  let hi = Math.max(vMax, ...visibleLines.map((line) => line.value))
  if (hi - lo < (invert ? 2 : 0.01)) {
    const pad = invert ? 1 : 0.005
    lo -= pad
    hi += pad
  }
  if (invert) lo = Math.max(1, lo)
  const y = (value: number) => {
    const ratio = (value - lo) / (hi - lo)
    return invert ? 6 + ratio * 88 : 94 - ratio * 88
  }
  const x = (t: number) => ((t - start) / span) * 100

  let path = `M0 ${y(points[0].v).toFixed(2)}`
  for (let index = 1; index < points.length; index += 1) {
    path += ` H${x(points[index].t).toFixed(2)} V${y(points[index].v).toFixed(2)}`
  }
  path += " H100"

  const step = niceStep(hi - lo, 4)
  const ticks: number[] = []
  for (let value = Math.ceil(lo / step) * step; value <= hi + 1e-9; value += step) ticks.push(Number(value.toFixed(6)))

  const months: Array<{ left: number; label: string }> = []
  const cursor = new Date(start * 1000)
  cursor.setUTCDate(1)
  cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  while (cursor.getTime() / 1000 < end) {
    months.push({ left: x(cursor.getTime() / 1000), label: monthFormatter.format(cursor) })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  const monthStride = Math.ceil(months.length / 7)

  const valueAt = (t: number) => {
    let value = points[0].v
    for (const point of points) {
      if (point.t <= t) value = point.v
      else break
    }
    return value
  }
  const hoverT = hover === null ? null : start + (hover / 100) * span
  const hoverValue = hoverT === null ? null : valueAt(hoverT)

  const track = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width) return
    setHover(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
  }

  return (
    <figure className="m-0 flex flex-col gap-1" aria-label={label}>
      <div className="relative ml-12 h-[196px]">
        {ticks.map((tick) => (
          <div key={tick} className="absolute -left-12 right-0 flex h-0 items-center" style={{ top: `${y(tick)}%` }}>
            <span className="num mr-2 w-10 shrink-0 text-right text-[11px] text-subtle-foreground">{format(tick)}</span>
            <span className="h-px flex-1 bg-[#1f1f1f]" />
          </div>
        ))}
        {visibleLines.map((line) => (
          <div key={line.label} className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(line.value)}%`, borderColor: line.color }}>
            <span className="label-caps absolute bottom-1 right-0 text-[12px]" style={{ color: line.color }}>
              {line.label}
            </span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
          style={{ left: "100%", top: `${y(points[points.length - 1].v)}%` }}
        />
        {hover !== null && hoverValue !== null && hoverT !== null ? (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-[#5a5a5a]" style={{ left: `${hover}%` }} />
            <span
              aria-hidden
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-surface"
              style={{ left: `${hover}%`, top: `${y(hoverValue)}%` }}
            />
            <span
              className={cn(
                "pointer-events-none absolute top-1 flex flex-col gap-0.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-3 px-2.5 py-1.5",
                hover > 62 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"
              )}
              style={{ left: `${hover}%` }}
            >
              <span className="text-[12px] text-muted-foreground">{dayFormatter.format(new Date(hoverT * 1000))}</span>
              <span className="num text-[15px] font-semibold">{format(hoverValue)}</span>
            </span>
          </>
        ) : null}
        <div
          className="absolute inset-0 cursor-crosshair touch-pan-y"
          onPointerMove={(event) => track(event.clientX, event.currentTarget)}
          onPointerDown={(event) => track(event.clientX, event.currentTarget)}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHover(null)
          }}
        />
      </div>
      <div aria-hidden className="relative ml-12 h-4">
        {months
          .filter((_, index) => index % monthStride === 0)
          .map((month) => (
            <span key={month.left} className="num absolute -translate-x-1/2 text-[11px] text-subtle-foreground" style={{ left: `${month.left}%` }}>
              {month.label}
            </span>
          ))}
      </div>
      <figcaption className="sr-only">
        {label}: from {format(points[0].v)} to {format(points[points.length - 1].v)}.
      </figcaption>
    </figure>
  )
}
