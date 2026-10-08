"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { dragHasFiles } from "@/lib/pending-run-files"

// Takes files dropped anywhere on the page, so a video let go over the
// header or the margins is used instead of the browser opening it in place
// of the page. Drop targets that handle their own files call
// stopPropagation, and this never sees those. Returns whether files are
// being dragged over the page right now.
export function usePageFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false)
  const handleFiles = useEffectEvent(onFiles)

  useEffect(() => {
    if (!enabled) return
    // dragenter/dragleave fire for every element crossed, so count them to
    // know when the drag has really left the window.
    let depth = 0

    const onDragEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }
    const onDragLeave = (event: DragEvent) => {
      if (!dragHasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    // Capture phase, so the drag ends even when a drop target below stops
    // the drop from bubbling up to the window.
    const onDropCapture = () => {
      depth = 0
      setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event)) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) handleFiles(files)
    }

    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDropCapture, true)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDropCapture, true)
      window.removeEventListener("drop", onDrop)
      setDragging(false)
    }
  }, [enabled])

  return dragging
}
