"use client"

import * as React from "react"

type RechartsMouseState = { activeTooltipIndex?: unknown } | null | undefined

function parseIndex(state: RechartsMouseState) {
  if (!state || state.activeTooltipIndex == null) {
    return null
  }
  const index = Number(state.activeTooltipIndex as string | number)
  return Number.isFinite(index) ? index : null
}

// Click-and-drag zoom for a Recharts chart: drag over a range to zoom into
// it, drag again on the zoomed view to zoom further, resetZoom to return to
// the full range. Works against the data array's index (via Recharts'
// activeTooltipIndex) rather than axis domain values, so the same hook
// works whether the x axis is numeric (score-history's timestamps) or
// categorical (rank-history's date strings).
export function useChartZoom<T>(data: T[]) {
  const [zoomRange, setZoomRange] = React.useState<[number, number] | null>(null)
  const [dragStart, setDragStart] = React.useState<number | null>(null)
  const [dragEnd, setDragEnd] = React.useState<number | null>(null)

  // A refetch (different data length) invalidates any in-progress zoom --
  // old indices could point at the wrong rows in new data. Reset inline
  // during render (React's documented pattern for "adjust state when a
  // prop changes") rather than in an effect, which would apply the reset a
  // frame late and flash the stale zoomed view first.
  const [prevDataLength, setPrevDataLength] = React.useState(data.length)
  if (data.length !== prevDataLength) {
    setPrevDataLength(data.length)
    setZoomRange(null)
  }

  const baseStart = zoomRange?.[0] ?? 0

  const visibleData = React.useMemo(() => {
    if (!zoomRange) {
      return data
    }
    return data.slice(zoomRange[0], zoomRange[1] + 1)
  }, [data, zoomRange])

  const finishDrag = React.useCallback(() => {
    const start = dragStart
    const end = dragEnd
    setDragStart(null)
    setDragEnd(null)

    if (start == null || end == null || start === end) {
      return
    }

    const [localFrom, localTo] = start < end ? [start, end] : [end, start]
    if (localTo - localFrom < 1) {
      return
    }

    setZoomRange([baseStart + localFrom, baseStart + localTo])
  }, [baseStart, dragStart, dragEnd])

  const onMouseDown = React.useCallback((state: RechartsMouseState) => {
    const index = parseIndex(state)
    if (index == null) {
      return
    }
    setDragStart(index)
    setDragEnd(index)
  }, [])

  const onMouseMove = React.useCallback(
    (state: RechartsMouseState) => {
      if (dragStart == null) {
        return
      }
      const index = parseIndex(state)
      if (index == null) {
        return
      }
      setDragEnd(index)
    },
    [dragStart]
  )

  const resetZoom = React.useCallback(() => setZoomRange(null), [])

  const dragSelection: [number, number] | null =
    dragStart != null && dragEnd != null && dragStart !== dragEnd
      ? [Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd)]
      : null

  return {
    visibleData,
    isZoomed: zoomRange != null,
    dragSelection,
    resetZoom,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp: finishDrag,
      onMouseLeave: finishDrag,
    },
  }
}
