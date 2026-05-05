"use client"

import { useEffect, useRef, useState } from "react"

type ScoreVideoPreviewProps = {
  submissionUuid: string
}

export function ScoreVideoPreview({ submissionUuid }: ScoreVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const container = containerRef.current

    if (!container || shouldLoad) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: "600px",
      }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [shouldLoad])

  return (
    <div ref={containerRef} className="aspect-video max-h-full w-full overflow-hidden rounded-lg bg-muted">
      {shouldLoad && (
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
