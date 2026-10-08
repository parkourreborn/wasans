"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

export const ASSETS_URL = "https://assets.wasans.tully.sh"

export type VideoStatus = "processing" | "ready" | "failed"

export function runVideoUrl(submissionUuid: string) {
  return `${ASSETS_URL}/scores/${submissionUuid}.mp4`
}

export function runPosterUrl(submissionUuid: string) {
  return `${ASSETS_URL}/scores/${submissionUuid}-preview.jpg`
}

// A run's processed video, with the states a submission's video can be in:
// still processing on the server, failed processing, or failing to load in
// the browser. Give it a `key` per video so a new one starts fresh.
export function RunVideo({
  submissionUuid,
  status = "ready",
  errorMessage,
  showPoster = true,
  label,
  fallback,
  className,
}: {
  submissionUuid: string
  status?: VideoStatus | null
  errorMessage?: string | null
  showPoster?: boolean
  label: string
  // Shown when the file can't be loaded, e.g. a link to the run page.
  fallback?: React.ReactNode
  className?: string
}) {
  const [loadFailed, setLoadFailed] = useState(false)
  const state = status ?? "ready"

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border border-line-strong bg-black", className)}>
      {state === "processing" ? (
        <div className="flex size-full flex-col items-center justify-center gap-3 px-4 text-center">
          <Spinner className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Processing the video. This usually takes under a minute.</p>
        </div>
      ) : state === "failed" ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="label-caps text-[15px] text-destructive">Video processing failed</p>
          <p className="max-w-md text-sm text-muted-foreground">{errorMessage || "The video couldn't be processed."}</p>
        </div>
      ) : loadFailed ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm text-muted-foreground">This video couldn&apos;t be loaded.</p>
          {fallback}
        </div>
      ) : (
        <video
          src={runVideoUrl(submissionUuid)}
          poster={showPoster ? runPosterUrl(submissionUuid) : undefined}
          controls
          playsInline
          preload="metadata"
          onError={() => setLoadFailed(true)}
          aria-label={label}
          className="size-full bg-black object-contain"
        />
      )}
    </div>
  )
}
