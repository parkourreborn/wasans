// Shared by captureVideoFrame and captureVideoFrameFromUrl: seeks a <video>
// element (already pointed at some src) to ~10% in and draws that frame to
// a JPEG blob via <canvas>. `cleanup` runs once, after the result settles
// (revoking an object URL for the file case; a no-op for the URL case).
function captureFrameFromVideoElement(video: HTMLVideoElement, cleanup: () => void): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Blob | null) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }

    video.onloadedmetadata = () => {
      const seekTo = Number.isFinite(video.duration) ? Math.min(1, video.duration * 0.1) : 0
      video.currentTime = seekTo
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const context = canvas.getContext("2d")
        if (!context || canvas.width === 0 || canvas.height === 0) {
          finish(null)
          return
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.8)
      } catch {
        finish(null)
      }
    }

    video.onerror = () => finish(null)
    setTimeout(() => finish(null), 8000)
  })
}

// Grabs a single frame from a local video file as a JPEG blob, entirely in
// the browser (a hidden <video> seeked to ~10% in, drawn to a <canvas>).
// Used at upload time so score-video-preview.tsx can show an image instead
// of loading the whole video just to paint one frame.
export async function captureVideoFrame(file: File): Promise<Blob | null> {
  const video = document.createElement("video")
  video.preload = "metadata"
  video.muted = true
  video.playsInline = true

  const url = URL.createObjectURL(file)
  video.src = url

  return captureFrameFromVideoElement(video, () => URL.revokeObjectURL(url))
}

// Same capture as captureVideoFrame, but for a video already hosted at a
// URL rather than a local File — used for Medal-link submissions, whose
// video is fetched server-side (no local File to grab a frame from at
// upload time). Requires the video response to carry CORS headers (see the
// R2 bucket's CORS policy in scripts/r2-cors.json) — without them, drawing
// a cross-origin frame to <canvas> throws and toBlob() never resolves,
// which the 8s timeout in captureFrameFromVideoElement turns into a null.
export async function captureVideoFrameFromUrl(url: string): Promise<Blob | null> {
  const video = document.createElement("video")
  video.preload = "metadata"
  video.muted = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  video.src = url

  return captureFrameFromVideoElement(video, () => {})
}
