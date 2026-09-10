"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"

export type TrialDistributionPoint = {
  trial_name: string
  player_score: number | null
  mean: number
  stddev: number
  sample_size: number
  percentile: number | null
}

const chartConfig: ChartConfig = {
  density: { label: "Players", color: "var(--chart-2)" },
}

// Minimum spread used when every sampled player is tied (or only one player
// has a PB) -- without this the Gaussian collapses to an undrawable spike.
const MIN_STDDEV = 0.03

function gaussianDensity(x: number, mean: number, stddev: number) {
  const safeStddev = Math.max(stddev, MIN_STDDEV)
  return Math.exp(-0.5 * ((x - mean) / safeStddev) ** 2) / (safeStddev * Math.sqrt(2 * Math.PI))
}

function buildCurve(mean: number, stddev: number, points = 48) {
  const safeStddev = Math.max(stddev, MIN_STDDEV)
  const min = Math.max(0, mean - 3.5 * safeStddev)
  const max = Math.min(1, mean + 3.5 * safeStddev)
  const step = (max - min) / Math.max(points - 1, 1)

  return Array.from({ length: points }, (_, index) => {
    const score = Number((min + step * index).toFixed(3))
    return { score, density: gaussianDensity(score, mean, stddev) }
  })
}

// A fitted normal curve over this trial's per-player score distribution
// (0-1, via calculateScore), with the viewed player's own score marked on
// it. Score is used rather than raw time so every trial's chart sits on the
// same 0-1 scale regardless of how long the trial takes to run.
export function TrialDistributionChart({ point }: { point: TrialDistributionPoint }) {
  const data = React.useMemo(() => buildCurve(point.mean, point.stddev), [point.mean, point.stddev])

  if (point.sample_size < 3) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Not enough players have a PB on {point.trial_name} yet for a distribution.
      </div>
    )
  }

  const domain: [number, number] = [data[0]?.score ?? 0, data[data.length - 1]?.score ?? 1]

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{point.trial_name}</span>
        {point.percentile != null ? (
          <Badge variant="outline" className="font-mono shrink-0">
            Top {Math.max(1, Math.round(100 - point.percentile))}%
          </Badge>
        ) : (
          <Badge variant="ghost" className="shrink-0 text-muted-foreground">
            No PB yet
          </Badge>
        )}
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-28 w-full">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="score"
            type="number"
            domain={domain}
            tickFormatter={(value: number) => value.toFixed(2)}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Area
            dataKey="density"
            type="monotone"
            stroke="var(--color-density)"
            fill="var(--color-density)"
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
          {point.player_score != null && (
            <ReferenceDot
              x={point.player_score}
              y={gaussianDensity(point.player_score, point.mean, point.stddev)}
              r={5}
              fill="var(--chart-1)"
              stroke="var(--background)"
              strokeWidth={2}
              label={{ value: "You", position: "top", fontSize: 11, fill: "var(--chart-1)" }}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
