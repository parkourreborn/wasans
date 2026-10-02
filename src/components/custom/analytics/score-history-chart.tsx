"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CartesianGrid, ComposedChart, Line, ReferenceArea, Scatter, XAxis, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { useChartZoom } from "@/components/custom/analytics/use-chart-zoom"

export type ScoreHistoryReason = "pb" | "wr_gained" | "wr_affected" | "trial_lifecycle" | "manual_refresh" | "backfill"

export type ScoreHistoryRow = {
  score: number
  recorded_at: number
  reason: ScoreHistoryReason
  trial_name: string | null
  submission_uuid: string | null
}

type ScoreHistoryPoint = { date: number; score: number }
type ScoreHistoryEvent = ScoreHistoryPoint & {
  reason: ScoreHistoryReason
  trial_name: string | null
  submission_uuid: string | null
  delta: number
}

const chartConfig: ChartConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
}

const DOT_REASONS = new Set<ScoreHistoryReason>(["pb", "wr_gained", "wr_affected"])

const REASON_LABEL: Record<ScoreHistoryReason, string> = {
  pb: "New personal best",
  wr_gained: "New world record!",
  wr_affected: "",
  trial_lifecycle: "Recalculated",
  manual_refresh: "Recalculated",
  backfill: "Recalculated",
}

function formatShortDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatFullDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function eventLabel(event: ScoreHistoryEvent) {
  if (event.reason === "wr_affected") {
    return event.delta < 0 ? "Lost the WR lead" : "WR got easier to reach"
  }
  return REASON_LABEL[event.reason]
}

// cx/cy come from Recharts' Scatter shape callback; reason/delta decide
// which marker to draw. "pb" and "wr_gained" can only ever be score
// increases (the app only accepts a submission that beats your existing
// PB), so only "wr_affected" needs a direction -- someone else's WR change
// usually drops your score, but can rise if a faster time is later deleted.
function EventMarker({ cx, cy, reason, delta }: { cx: number; cy: number; reason: ScoreHistoryReason; delta: number }) {
  if (reason === "wr_gained") {
    const r = 6
    return (
      <path
        d={`M ${cx} ${cy - r} L ${cx + r * 0.62} ${cy} L ${cx} ${cy + r} L ${cx - r * 0.62} ${cy} Z`}
        fill="var(--chart-1)"
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    )
  }

  if (reason === "wr_affected") {
    const r = 5
    const pointsUp = delta >= 0
    const apexY = pointsUp ? cy - r : cy + r
    const baseY = pointsUp ? cy + r * 0.7 : cy - r * 0.7
    return (
      <path
        d={`M ${cx} ${apexY} L ${cx + r} ${baseY} L ${cx - r} ${baseY} Z`}
        fill="var(--chart-2)"
        stroke="var(--background)"
        strokeWidth={1}
      />
    )
  }

  return <circle cx={cx} cy={cy} r={4} fill="var(--chart-1)" stroke="var(--background)" strokeWidth={1} />
}

export function ScoreHistoryChart({ rows }: { rows: ScoreHistoryRow[] }) {
  const router = useRouter()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = React.useState<{ event: ScoreHistoryEvent; x: number; y: number } | null>(null)

  const events = React.useMemo<ScoreHistoryEvent[]>(() => {
    return rows
      .map((row, index) => ({
        date: row.recorded_at,
        score: row.score,
        reason: row.reason,
        trial_name: row.trial_name,
        submission_uuid: row.submission_uuid,
        delta: index > 0 ? row.score - rows[index - 1].score : 0,
      }))
      .filter((event) => DOT_REASONS.has(event.reason))
  }, [rows])

  const lineData = React.useMemo<ScoreHistoryPoint[]>(
    () => rows.map((row) => ({ date: row.recorded_at, score: row.score })),
    [rows]
  )

  const zoom = useChartZoom(lineData)

  if (rows.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Not enough history yet &mdash; this fills in as your score changes.
      </div>
    )
  }

  const visibleData = zoom.visibleData
  const firstDate = visibleData[0].date
  const lastDate = visibleData[visibleData.length - 1].date

  // Recharts clips scatter markers to the plot area; a point sitting exactly
  // on dataMin/dataMax renders half-clipped, which also makes its hit
  // target unreliable. Padding the domain keeps the first/last marker's
  // full circle (and click target) inside the plot.
  const dateRange = lastDate - firstDate
  const datePadding = Math.max(dateRange * 0.03, 3600)
  const xDomain: [number, number] = [firstDate - datePadding, lastDate + datePadding]

  const visibleEvents = events.filter((event) => event.date >= firstDate && event.date <= lastDate)

  const dragArea =
    zoom.dragSelection && visibleData[zoom.dragSelection[0]] && visibleData[zoom.dragSelection[1]]
      ? { x1: visibleData[zoom.dragSelection[0]].date, x2: visibleData[zoom.dragSelection[1]].date }
      : null

  const handleEnter = (event: ScoreHistoryEvent, _index: number, mouseEvent: React.MouseEvent) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    setHovered({ event, x: mouseEvent.clientX - bounds.left, y: mouseEvent.clientY - bounds.top })
  }

  const handleClick = (event: ScoreHistoryEvent) => {
    if (event.submission_uuid) {
      router.push(`/submissions/${event.submission_uuid}`)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="absolute top-0 right-0 z-10">
        {zoom.isZoomed ? (
          <Button type="button" variant="ghost" size="xs" onClick={zoom.resetZoom}>
            Reset zoom
          </Button>
        ) : (
          <span className="px-2.5 py-1 text-xs text-muted-foreground">Drag to zoom</span>
        )}
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full select-none">
        <ComposedChart
          data={visibleData}
          margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
          onMouseDown={zoom.handlers.onMouseDown}
          onMouseMove={zoom.handlers.onMouseMove}
          onMouseUp={zoom.handlers.onMouseUp}
          onMouseLeave={zoom.handlers.onMouseLeave}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            type="number"
            domain={xDomain}
            tickFormatter={formatShortDate}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            allowDataOverflow
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={[0, "auto"]} />
          <Line
            dataKey="score"
            type="stepAfter"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter
            data={visibleEvents}
            dataKey="score"
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: ScoreHistoryEvent }
              return (
                <g
                  style={{ cursor: payload.submission_uuid ? "pointer" : "default" }}
                  onMouseEnter={(mouseEvent) => handleEnter(payload, 0, mouseEvent)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleClick(payload)}
                >
                  <circle cx={cx} cy={cy} r={10} fill="transparent" />
                  <EventMarker cx={cx} cy={cy} reason={payload.reason} delta={payload.delta} />
                </g>
              )
            }}
            isAnimationActive={false}
          />
          {dragArea && (
            <ReferenceArea x1={dragArea.x1} x2={dragArea.x2} fill="var(--chart-1)" fillOpacity={0.1} stroke="var(--chart-1)" strokeOpacity={0.3} />
          )}
        </ComposedChart>
      </ChartContainer>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: hovered.x, top: hovered.y - 10 }}
        >
          <div className="font-medium text-foreground">{formatFullDate(hovered.event.date)}</div>
          {hovered.event.trial_name && <div className="text-muted-foreground">{hovered.event.trial_name}</div>}
          <div className="text-muted-foreground">{eventLabel(hovered.event)}</div>
          <div className="font-mono font-medium text-foreground">{hovered.event.score.toFixed(3)}</div>
          {hovered.event.submission_uuid && <div className="text-muted-foreground">Click to view submission</div>}
        </div>
      )}
    </div>
  )
}
