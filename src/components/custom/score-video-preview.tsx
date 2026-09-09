"use client"

import { useEffect, useRef, useState } from "react"
import { useSettings } from "@/components/custom/settings-provider"
import { apiV2 } from "@/lib/api"
import { captureVideoFrameFromUrl } from "@/lib/video-thumbnail"

type ScoreVideoPreviewProps = {
  submissionUuid: string
}

// Medal-link submissions generate their preview asynchronously right after
// creation (see submissions/new page) — a few seconds where the -preview.jpg
// object legitimately doesn't exist yet. A single 404 used to fall back to
// the video permanently for the lifetime of this component; retrying a
// couple times with a short delay covers that window without polling forever.
const previewRetryDelaysMs = [2000, 5000]

// Submissions occasionally never get a preview at all (the upload-time
// capture can miss — closed tab, flaky network, an undecodable frame — see
// the comment on the preview route). Nothing used to retry that, so those
// submissions stayed thumbnail-less forever. Once retries above are
// exhausted and we're genuinely falling back to the raw <video>, take the
// chance to re-capture a frame from it and PUT it back — the preview route
// accepts this from any signed-in viewer as long as no preview exists yet.
// Deduped per submission per session so many instances of the same
// submission (e.g. across lists) don't all attempt it at once.
const repairAttempted = new Set<string>()

async function repairMissingPreview(submissionUuid: string) {
  if (repairAttempted.has(submissionUuid)) {
    return
  }
  repairAttempted.add(submissionUuid)

  const blob = await captureVideoFrameFromUrl(`https://assets.wasans.tully.sh/scores/${submissionUuid}.mp4`)
  if (!blob) {
    return
  }

  await fetch(apiV2(`/submissions/${submissionUuid}/preview`), {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: blob,
  }).catch(() => {})
}

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

  useEffect(() => {
    if (previewFailed) {
      void repairMissingPreview(submissionUuid)
    }
  }, [previewFailed, submissionUuid])

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
