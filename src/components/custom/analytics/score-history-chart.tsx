"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

export type ScoreHistoryRow = { score: number; recorded_at: number; reason: string }

const chartConfig: ChartConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
}

function formatShortDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ScoreHistoryChart({ rows }: { rows: ScoreHistoryRow[] }) {
  if (rows.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Not enough history yet &mdash; this fills in as your score changes.
      </div>
    )
  }

  const data = rows.map((row) => ({ date: row.recorded_at, score: row.score }))

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatShortDate}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={[0, "auto"]} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatShortDate(Number(value))} />} />
        <Line
          dataKey="score"
          type="monotone"
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
