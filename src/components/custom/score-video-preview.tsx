"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/custom/settings-provider"
import { Spinner } from "@/components/ui/spinner"

export type VideoStatus = "processing" | "ready" | "failed"

type ScoreVideoPreviewProps = {
  submissionUuid: string
  videoStatus?: VideoStatus | null
}

// Thumbnails are generated server-side by the video processing container
// (video-worker/), and a submission only becomes "ready" once its
// -preview.jpg exists, so there's nothing to capture or repair here. The
// <video> fallback only covers the rare legacy video whose thumbnail is
// missing until the /admin backfill reaches it.
export function ScoreVideoPreview({ submissionUuid, videoStatus }: ScoreVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const settings = useSettings()
  const disableSubmissionThumbnails = settings?.disableSubmissionThumbnails ?? false

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "200px" }
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const status = videoStatus ?? "ready"
  const shouldLoad = isVisible && !disableSubmissionThumbnails && status === "ready"

  return (
    <div ref={containerRef} className="aspect-video max-h-full w-full overflow-hidden rounded-lg bg-muted">
      {disableSubmissionThumbnails ? (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Thumbnails disabled
        </div>
      ) : status === "processing" ? (
        <div className="flex h-full w-full items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
          <Spinner className="size-3" /> Processing video…
        </div>
      ) : status === "failed" ? (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-destructive">
          Video processing failed
        </div>
      ) : null}
      {shouldLoad && !previewFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://assets.wasans.tully.sh/scores/${submissionUuid}-preview.jpg`}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setPreviewFailed(true)}
        />
      ) : null}
      {shouldLoad && previewFailed ? (
        <video
          src={`https://assets.wasans.tully.sh/scores/${submissionUuid}.mp4`}
          className="h-full w-full object-cover"
          controls={false}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
