"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/custom/settings-provider"

type ScoreVideoPreviewProps = {
  submissionUuid: string
}

export function ScoreVideoPreview({ submissionUuid }: ScoreVideoPreviewProps) {
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

  const shouldLoad = isVisible && !disableSubmissionThumbnails

  return (
    <div ref={containerRef} className="aspect-video max-h-full w-full overflow-hidden rounded-lg bg-muted">
      {disableSubmissionThumbnails ? (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Thumbnails disabled
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
