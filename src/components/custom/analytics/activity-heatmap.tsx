"use client"

import * as React from "react"

export type ActivityDay = { date: string; count: number }

type Cell = { date: string; count: number } | null

function buildWeeks(days: ActivityDay[], totalDays: number): Cell[][] {
  const countByDate = new Map(days.map((day) => [day.date, day.count]))
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cells: Array<{ date: string; count: number }> = []
  for (let i = totalDays - 1; i >= 0; i -= 1) {
    const date = new Date(today)
    date.setUTCDate(date.getUTCDate() - i)
    const iso = date.toISOString().slice(0, 10)
    cells.push({ date: iso, count: countByDate.get(iso) ?? 0 })
  }

  // Pad the front with empty cells so every column lines up on the same
  // weekday (Sunday-start), matching a GitHub-style contribution grid.
  const leadingPad = new Date(`${cells[0].date}T00:00:00Z`).getUTCDay()
  const padded: Cell[] = [...Array.from({ length: leadingPad }, (): Cell => null), ...cells]

  const weeks: Cell[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }
  return weeks
}

// Four visible intensity steps (plus "none") rather than a continuous
// opacity scale -- a handful of discrete, perceivable buckets reads more
// clearly at this size than a scale most viewers can't distinguish anyway.
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1]

function levelForCount(count: number, max: number) {
  if (count <= 0 || max <= 0) {
    return 0
  }
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

export function ActivityHeatmap({ days, totalDays = 84 }: { days: ActivityDay[]; totalDays?: number }) {
  const weeks = React.useMemo(() => buildWeeks(days, totalDays), [days, totalDays])
  const max = React.useMemo(() => Math.max(1, ...days.map((day) => day.count)), [days])

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="flex flex-col gap-1">
          {week.map((cell, dayIndex) =>
            cell ? (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count} approved submission${cell.count === 1 ? "" : "s"}`}
                className="size-3 rounded-sm border border-border/50"
                style={{ backgroundColor: "var(--chart-1)", opacity: LEVEL_OPACITY[levelForCount(cell.count, max)] }}
              />
            ) : (
              <div key={`empty-${weekIndex}-${dayIndex}`} className="size-3" />
            )
          )}
        </div>
      ))}
    </div>
  )
}
