"use client"

import { useState } from "react"
import { FileVideoIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { VideoPlayer } from "@/components/site/video-player"
import { Spinner } from "@/components/ui/spinner"

export const ASSETS_URL = "https://assets.wasans.tully.sh"

export type VideoStatus = "processing" | "ready" | "failed"

export function runVideoUrl(submissionUuid: string) {
  return `${ASSETS_URL}/scores/${submissionUuid}.mp4`
}

export function runPosterUrl(submissionUuid: string) {
  return `${ASSETS_URL}/scores/${submissionUuid}-preview.jpg`
}

// A run's thumbnail on its own, for lists and places a video would be too
// much. Give it a `key` per run so a missing one doesn't stick.
export function RunThumbnail({ submissionUuid, alt = "", className }: { submissionUuid: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden bg-surface-3", className)}>
      {failed ? (
        <FileVideoIcon className="size-8 text-subtle-foreground" aria-hidden />
      ) : (
        // A plain img: the poster lives on the assets host and may be missing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={runPosterUrl(submissionUuid)} alt={alt} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
      )}
    </div>
  )
}

// A run's processed video, with the states a submission's video can be in:
// still processing on the server, failed processing, or failing to load in
// the browser. Give it a `key` per video so a new one starts fresh.
export function RunVideo({
  submissionUuid,
  status = "ready",
  errorMessage,
  showPoster = true,
  fps,
  label,
  fallback,
  className,
}: {
  submissionUuid: string
  status?: VideoStatus | null
  errorMessage?: string | null
  // Off when the viewer turned thumbnails off, which also turns off the
  // timeline's frame previews.
  showPoster?: boolean
  // The frame rate the server probed, for frame stepping.
  fps?: number | null
  label: string
  // Shown when the file can't be loaded, e.g. a link to the run page.
  fallback?: React.ReactNode
  className?: string
}) {
  const [loadFailed, setLoadFailed] = useState(false)
  const state = status ?? "ready"

  if (state === "ready" && !loadFailed) {
    return (
      <VideoPlayer
        src={runVideoUrl(submissionUuid)}
        poster={showPoster ? runPosterUrl(submissionUuid) : undefined}
        previews={showPoster}
        fps={fps}
        label={label}
        onError={() => setLoadFailed(true)}
        className={className}
      />
    )
  }

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
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm text-muted-foreground">This video couldn&apos;t be loaded.</p>
          {fallback}
        </div>
      )}
    </div>
  )
}
