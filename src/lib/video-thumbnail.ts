// Grabs a single frame from a local video file as a JPEG blob, entirely in
// the browser (a hidden <video> seeked to ~10% in, drawn to a <canvas>).
// Used at upload time so score-video-preview.tsx can show an image instead
// of loading the whole video just to paint one frame.
export async function captureVideoFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true

    const url = URL.createObjectURL(file)
    video.src = url

    let settled = false
    const finish = (result: Blob | null) => {
      if (settled) {
        return
      }
      settled = true
      URL.revokeObjectURL(url)
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
