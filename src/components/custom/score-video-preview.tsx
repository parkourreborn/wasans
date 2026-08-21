"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/custom/settings-provider"

type ScoreVideoPreviewProps = {
  submissionUuid: string
}

// Medal-link submissions generate their preview asynchronously right after
// creation (see submissions/new page) — a few seconds where the -preview.jpg
// object legitimately doesn't exist yet. A single 404 used to fall back to
// the video permanently for the lifetime of this component; retrying a
// couple times with a short delay covers that window without polling forever.
const previewRetryDelaysMs = [2000, 5000]

export function ScoreVideoPreview({ submissionUuid }: ScoreVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
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

  const handlePreviewError = () => {
    if (retryCount >= previewRetryDelaysMs.length) {
      setPreviewFailed(true)
      return
    }

    const delay = previewRetryDelaysMs[retryCount]
    window.setTimeout(() => setRetryCount((count) => count + 1), delay)
  }

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
          key={retryCount}
          src={`https://assets.wasans.tully.sh/scores/${submissionUuid}-preview.jpg?retry=${retryCount}`}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={handlePreviewError}
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
