// Runs inside the submission video processor container (see
// ../src/processing.js). Processes one submission's video, reports the
// result, and exits:
//
//   get the original -> probe/validate -> remux or transcode to H.264 MP4
//   (<=1080p, <=60fps) -> thumbnail -> publish to scores/{uuid}.mp4 and
//   scores/{uuid}-preview.jpg
//
// Like render.mjs, the container holds no credentials. Every read and write
// goes through http://media.internal, whose Worker handlers derive every
// object key from this container's own job, so the container can't read or
// write any other submission's files.
//
// Errors are split into permanent (the video itself is unusable: corrupt,
// no video stream, too long or too big) and retryable (anything else). The
// Worker retries the retryable ones; permanent ones go straight to "failed"
// with a message the player can act on.

import { mkdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { ShutdownError, SizeLimitError, isShuttingDown, onShutdown, readJob, run, saveResponse, uploadMultipart } from "./lib.mjs"

const MEDIA_BASE = process.env.MEDIA_BASE || "http://media.internal"
const STATUS_URL = process.env.STATUS_URL || "http://status.internal/result"
const WORK_DIR = process.env.WORK_DIR || "/work"

const MAX_LONG_EDGE = 1920
const MAX_SHORT_EDGE = 1080
const MAX_FPS = 60
// Above this, an otherwise-compliant H.264 file is still re-encoded: it
// would stream badly, and nothing a trial run needs survives the extra bits.
const MAX_REMUX_VIDEO_BITRATE = 16_000_000
const THUMBNAIL_MAX_WIDTH = 1280

class PermanentError extends Error {}

function parseRate(value) {
  if (!value || value === "0/0") return 0
  const [num, den] = String(value).split("/").map(Number)
  return den ? num / den : num
}

async function probe(file) {
  let output
  try {
    // Whole stream/format sections rather than -show_entries, whose
    // section names have shifted between ffmpeg versions.
    output = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file])
  } catch {
    throw new PermanentError("The file isn't a video we can read. It may be corrupt or an unsupported format.")
  }

  const info = JSON.parse(output)
  const streams = info.streams || []
  // Cover art ("attached picture") is a still image some muxers list as a
  // video stream, sometimes before the real one.
  const video = streams.find(
    (stream) => stream.codec_type === "video" && stream.width && stream.height && !stream.disposition?.attached_pic
  )
  if (!video) {
    throw new PermanentError("The file has no video track.")
  }
  const audio = streams.find((stream) => stream.codec_type === "audio")

  const rotationSideData = (video.side_data_list || []).find((entry) => entry.rotation !== undefined)
  const rotation = Math.abs(Number(rotationSideData?.rotation ?? video.tags?.rotate ?? 0)) % 360
  const rotated = rotation === 90 || rotation === 270
  // Width/height as the video is actually displayed (ffmpeg autorotates).
  const width = rotated ? video.height : video.width
  const height = rotated ? video.width : video.height

  const avg = parseRate(video.avg_frame_rate)
  const fps = avg > 0 ? avg : parseRate(video.r_frame_rate)
  const duration = Number(video.duration) || Number(info.format?.duration) || 0
  const videoBitrate = Number(video.bit_rate) || Number(info.format?.bit_rate) || 0

  // ffmpeg only shifts timestamps by the file's earliest stream, so a video
  // track that starts after its audio (or after an empty edit) keeps that
  // offset. Players then show black until it "starts", and filters that
  // work on timestamps misbehave. See transcode().
  const formatStart = Number(info.format?.start_time) || 0
  const videoStart = Number(video.start_time) || formatStart
  const audioStart = audio ? Number(audio.start_time) || formatStart : null

  return {
    formatName: String(info.format?.format_name || ""),
    videoCodec: video.codec_name,
    pixFmt: video.pix_fmt,
    width,
    height,
    rotation,
    fps,
    duration,
    videoBitrate,
    audioCodec: audio?.codec_name ?? null,
    videoIndex: video.index,
    audioIndex: audio?.index ?? null,
    videoOffset: Math.max(0, videoStart - formatStart),
    audioSkew: audioStart === null ? 0 : Math.abs(audioStart - videoStart),
  }
}

// Largest even-dimensioned size that fits the 1080p box for this
// orientation, never upscaling.
function targetSize(width, height) {
  const [maxW, maxH] = width >= height ? [MAX_LONG_EDGE, MAX_SHORT_EDGE] : [MAX_SHORT_EDGE, MAX_LONG_EDGE]
  const scale = Math.min(1, maxW / width, maxH / height)
  const even = (value) => Math.max(2, Math.floor((value * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

// Already plays everywhere and fits the limits, so the streams are copied
// untouched (lossless) and only the container is rewritten for fast start.
function canRemux(info) {
  const target = targetSize(info.width, info.height)
  return (
    /mp4|mov/.test(info.formatName) &&
    info.videoCodec === "h264" &&
    info.pixFmt === "yuv420p" &&
    info.rotation === 0 &&
    target.width === info.width &&
    target.height === info.height &&
    info.fps > 0 &&
    info.fps <= MAX_FPS + 0.5 &&
    (info.videoBitrate === 0 || info.videoBitrate <= MAX_REMUX_VIDEO_BITRATE) &&
    (info.audioCodec === null || info.audioCodec === "aac") &&
    // A copy keeps the original timestamps, so only remux when the video
    // already starts at the beginning, with audio alongside it.
    info.videoOffset <= 0.1 &&
    info.audioSkew <= 0.1
  )
}

async function remux(source, info, output) {
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-map", `0:${info.videoIndex}`,
    ...(info.audioIndex === null ? [] : ["-map", `0:${info.audioIndex}`]),
    "-c", "copy",
    "-movflags", "+faststart",
    output,
  ])
}

async function transcode(source, info, output) {
  const target = targetSize(info.width, info.height)
  // Re-base to 0 (see probe); audio is shifted by the same amount so it
  // stays in sync, trimmed before the video starts and padded with
  // silence if it starts later.
  const filters = ["setpts=PTS-STARTPTS", `scale=${target.width}:${target.height}:flags=lanczos`, "format=yuv420p"]
  // Keep the source frame rate; only high-refresh recordings get capped.
  if (info.fps > MAX_FPS + 0.5) {
    filters.splice(1, 0, `fps=${MAX_FPS}`)
  }
  const gop = Math.round(Math.min(info.fps || MAX_FPS, MAX_FPS) * 2)

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-map", `0:${info.videoIndex}`,
    ...(info.audioIndex === null
      ? []
      : [
          "-map", `0:${info.audioIndex}`,
          "-af", `asetpts=PTS-${info.videoOffset.toFixed(6)}/TB,atrim=start=0,aresample=48000:async=1:first_pts=0`,
        ]),
    "-vf", filters.join(","),
    "-c:v", "libx264",
    "-preset", process.env.X264_PRESET || "medium",
    "-crf", "20",
    "-profile:v", "high",
    "-maxrate", "12M", "-bufsize", "24M",
    "-g", String(gop),
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    output,
  ])
}

// Same frame the old browser-side capture picked (10% in, at most 1s), so
// existing and new thumbnails look alike.
async function thumbnail(video, duration, output) {
  const seek = Math.min(1, duration * 0.1)
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", seek.toFixed(3),
    "-i", video,
    "-frames:v", "1",
    "-vf", `scale='min(${THUMBNAIL_MAX_WIDTH},iw)':-2:flags=lanczos`,
    "-q:v", "3",
    output,
  ])
}

async function media(pathname, init) {
  return fetch(`${MEDIA_BASE}${pathname}`, init)
}

async function mediaChecked(pathname, init, what) {
  const response = await media(pathname, init)
  if (!response.ok) {
    throw new Error(`${what} failed (${response.status}): ${await response.text().catch(() => "")}`)
  }
  return response
}

function medalContentApiUrl(link) {
  const match = link.match(/clips\/([^?/]+)/)
  return match ? `https://medal.tv/api/content/${match[1]}/socialVideoUrl` : null
}

// Same resolution as the old Worker-side download: Medal's content API
// answers either with the video itself or with JSON/text naming its URL.
async function fetchMedalVideo(link) {
  const contentApiUrl = medalContentApiUrl(link)
  if (!contentApiUrl) {
    throw new PermanentError("That Medal link doesn't point to a clip.")
  }

  const response = await fetch(contentApiUrl, { headers: { accept: "application/json, text/plain;q=0.9" } })
  if (response.status === 404) {
    throw new PermanentError("Medal couldn't find that clip. Is it public?")
  }
  if (!response.ok) {
    throw new Error(`Medal content API responded ${response.status}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("video/") || contentType === "application/octet-stream") {
    return response
  }

  const body = (await response.text()).trim()
  let videoUrl = body
  if (contentType.includes("application/json") || body.startsWith("{") || body.startsWith("[")) {
    const parsed = JSON.parse(body)
    videoUrl = parsed?.url ?? parsed?.socialVideoUrl ?? parsed
  }
  if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
    throw new PermanentError("Medal didn't return a video for that clip.")
  }

  const video = await fetch(videoUrl)
  if (!video.ok) {
    throw new Error(`Medal video download responded ${video.status}`)
  }
  return video
}

// Puts the untouched original at `source`, preferring the private copy
// kept for moderators (it's also what a retry should start from).
async function obtainOriginal(job, source) {
  const existing = await media("/original")
  if (existing.ok) {
    await saveResponse(existing, source, job.maxBytes)
    return { from: "original" }
  }

  if (job.reason === "upload") {
    // First attempt: move the player's direct upload into originals/.
    const promoted = await media("/original/promote-upload", { method: "POST" })
    if (promoted.status === 404) {
      throw new PermanentError("The uploaded file is missing. Please submit again.")
    }
    if (!promoted.ok) {
      throw new Error(`promoting the upload failed (${promoted.status})`)
    }
    await saveResponse(await mediaChecked("/original", undefined, "reading the original"), source, job.maxBytes)
    return { from: "original" }
  }

  if (job.reason === "medal") {
    const video = await fetchMedalVideo(job.medalUrl)
    const declared = Number(video.headers.get("content-length") || "0")
    if (declared > job.maxBytes) {
      throw new SizeLimitError(job.maxBytes)
    }
    await saveResponse(video, source, job.maxBytes)
    await uploadMultipart(`${MEDIA_BASE}/original/multipart`, source, {
      contentType: video.headers.get("content-type")?.startsWith("video/") ? video.headers.get("content-type") : "video/mp4",
    })
    return { from: "original" }
  }

  // Backfill of a video that predates processing: the published file is all
  // there is. It's only copied into originals/ if it has to be re-encoded.
  const published = await media("/published")
  if (published.status === 404) {
    throw new PermanentError("This submission has no video file.")
  }
  if (!published.ok) {
    throw new Error(`reading the published video failed (${published.status})`)
  }
  await saveResponse(published, source)
  return { from: "published" }
}

async function report(result) {
  // The result is the whole point of the run, so it gets a few tries; if it
  // still can't be delivered, exiting non-zero lets the Worker treat the
  // run as crashed and retry it.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(STATUS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      })
      if (response.ok) return
      console.error(`Result report failed: ${response.status} ${await response.text().catch(() => "")}`)
    } catch (error) {
      console.error("Result report request failed:", error)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
  throw new Error("Could not deliver the processing result")
}

async function main(job) {
  await mkdir(WORK_DIR, { recursive: true })
  const source = path.join(WORK_DIR, "source")
  const output = path.join(WORK_DIR, "output.mp4")
  const preview = path.join(WORK_DIR, "preview.jpg")

  const { from } = await obtainOriginal(job, source)
  const info = await probe(source)
  if (info.duration > job.maxDurationSeconds) {
    throw new PermanentError(`The video is longer than ${Math.round(job.maxDurationSeconds / 60)} minutes.`)
  }

  const mode = canRemux(info) ? "remux" : "transcode"
  if (mode === "transcode" && from === "published") {
    // Re-encoding a legacy video loses its only full-quality copy, so keep
    // it privately first, same as a new upload's original.
    await mediaChecked("/original/copy-from-published", { method: "POST" }, "keeping the original")
  }

  if (mode === "remux") {
    await remux(source, info, output)
  } else {
    await transcode(source, info, output)
  }
  await rm(source, { force: true })

  const result = await probe(output)
  await thumbnail(output, result.duration, preview)

  const sizeBytes = await uploadMultipart(`${MEDIA_BASE}/published/multipart`, output, { contentType: "video/mp4" })
  const previewSize = (await stat(preview)).size
  await mediaChecked(
    "/preview",
    { method: "PUT", headers: { "content-type": "image/jpeg", "content-length": String(previewSize) }, body: await readFile(preview) },
    "publishing the thumbnail"
  )

  return {
    status: "ready",
    mode,
    original_kept: from === "original" || mode === "transcode",
    width: result.width,
    height: result.height,
    fps: Math.round(result.fps * 1000) / 1000,
    duration_seconds: Math.round(result.duration * 1000) / 1000,
    size_bytes: sizeBytes,
  }
}

const job = readJob()
// Stopped mid-job (e.g. a deploy): report a retryable failure, so the
// Worker re-queues it and it runs again on the new container.
onShutdown(async () => {
  await report({
    status: "failed",
    retryable: true,
    error: "Something went wrong while processing the video.",
    detail: new ShutdownError().message,
  }).catch(() => {})
})
try {
  const result = await main(job)
  await report(result)
  process.exit(0)
} catch (error) {
  if (error instanceof ShutdownError || isShuttingDown()) {
    // onShutdown reports and exits; don't race it with a second report.
    await new Promise(() => {})
  }
  console.error("Video processing failed:", error)
  const permanent = error instanceof PermanentError || error instanceof SizeLimitError
  try {
    await report({
      status: "failed",
      retryable: !permanent,
      error: permanent ? error.message : "Something went wrong while processing the video.",
      detail: String(error?.message || error).slice(0, 2000),
    })
    process.exit(0)
  } catch {
    process.exit(1)
  }
}
