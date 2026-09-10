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

function formatCellDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

type HoverState = { cell: { date: string; count: number }; x: number; y: number }

export function ActivityHeatmap({
  days,
  totalDays = 84,
  onSelectDate,
}: {
  days: ActivityDay[]
  totalDays?: number
  onSelectDate?: (isoDate: string) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = React.useState<HoverState | null>(null)

  const weeks = React.useMemo(() => buildWeeks(days, totalDays), [days, totalDays])
  const max = React.useMemo(() => Math.max(1, ...days.map((day) => day.count)), [days])

  const handleEnter = (cell: { date: string; count: number }, event: React.MouseEvent) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    setHovered({ cell, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((cell, dayIndex) =>
              cell ? (
                <button
                  key={cell.date}
                  type="button"
                  disabled={cell.count === 0 || !onSelectDate}
                  onMouseEnter={(event) => handleEnter(cell, event)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectDate?.(cell.date)}
                  className="size-3 rounded-sm border border-border/50 disabled:cursor-default enabled:cursor-pointer enabled:hover:border-foreground/40"
                  style={{ backgroundColor: "var(--chart-1)", opacity: LEVEL_OPACITY[levelForCount(cell.count, max)] }}
                />
              ) : (
                <div key={`empty-${weekIndex}-${dayIndex}`} className="size-3" />
              )
            )}
          </div>
        ))}
      </div>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: hovered.x, top: hovered.y - 8 }}
        >
          <div className="font-medium text-foreground">{formatCellDate(hovered.cell.date)}</div>
          <div className="text-muted-foreground">
            {hovered.cell.count} approved submission{hovered.cell.count === 1 ? "" : "s"}
            {hovered.cell.count > 0 && onSelectDate ? " — click to view" : ""}
          </div>
        </div>
      )}
    </div>
  )
}
