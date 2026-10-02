"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { useChartZoom } from "@/components/custom/analytics/use-chart-zoom"

export type RankHistoryRow = { rank: number; score: number; snapshot_date: string }
type RankHistoryPoint = { date: string; rank: number }

const chartConfig: ChartConfig = {
  rank: { label: "Rank", color: "var(--chart-1)" },
}

function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

type RankTooltipProps = { active?: boolean; payload?: Array<{ payload: RankHistoryPoint }> }

// Reads the date straight off the hovered point's own data rather than
// through Recharts' generic label-resolution path, which (see
// score-history-chart.tsx) can hand a non-date value to a date formatter.
function RankTooltip({ active, payload }: RankTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const point = payload[0]?.payload as RankHistoryPoint | undefined
  if (!point) {
    return null
  }

  return (
    <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{formatShortDate(point.date)}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Rank</span>
        <span className="font-mono font-medium text-foreground">#{point.rank}</span>
      </div>
    </div>
  )
}

// Y axis is reversed -- rank 1 (best) renders at the top, matching how
// "climbing the leaderboard" reads visually.
export function RankHistoryChart({ rows }: { rows: RankHistoryRow[] }) {
  const data = React.useMemo<RankHistoryPoint[]>(
    () => rows.map((row) => ({ date: row.snapshot_date, rank: row.rank })),
    [rows]
  )

  const zoom = useChartZoom(data)

  if (rows.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Rank history builds up one daily snapshot at a time &mdash; check back tomorrow.
      </div>
    )
  }

  const visibleData = zoom.visibleData
  const dragArea =
    zoom.dragSelection && visibleData[zoom.dragSelection[0]] && visibleData[zoom.dragSelection[1]]
      ? { x1: visibleData[zoom.dragSelection[0]].date, x2: visibleData[zoom.dragSelection[1]].date }
      : null

  return (
    <div className="relative">
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
        <LineChart
          data={visibleData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onMouseDown={zoom.handlers.onMouseDown}
          onMouseMove={zoom.handlers.onMouseMove}
          onMouseUp={zoom.handlers.onMouseUp}
          onMouseLeave={zoom.handlers.onMouseLeave}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis reversed tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip content={<RankTooltip />} />
          <Line
            dataKey="rank"
            type="monotone"
            stroke="var(--color-rank)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {dragArea && (
            <ReferenceArea x1={dragArea.x1} x2={dragArea.x2} fill="var(--chart-1)" fillOpacity={0.1} stroke="var(--chart-1)" strokeOpacity={0.3} />
          )}
        </LineChart>
      </ChartContainer>
    </div>
  )
}
