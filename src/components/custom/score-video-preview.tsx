"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/custom/settings-provider"

type ScoreVideoPreviewProps = {
  submissionUuid: string
}

export function ScoreVideoPreview({ submissionUuid }: ScoreVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const settings = useSettings()
  const disableSubmissionThumbnails = settings?.disableSubmissionThumbnails ?? false

  useEffect(() => {
    if (disableSubmissionThumbnails) {
      setShouldLoad(false)
      return
    }

    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShouldLoad(entry.isIntersecting)
      },
      {
        rootMargin: "200px",
      }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [disableSubmissionThumbnails])

  return (
    <div ref={containerRef} className="aspect-video max-h-full w-full overflow-hidden rounded-lg bg-muted">
      {disableSubmissionThumbnails ? (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Thumbnails disabled
        </div>
      ) : null}
      {!disableSubmissionThumbnails && shouldLoad && (
        <video
          src={`https://assets.wasans.tully.sh/scores/${submissionUuid}.mp4`}
          className="h-full w-full object-cover"
          controls={false}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
