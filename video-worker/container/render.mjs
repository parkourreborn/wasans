// Runs inside the compilation container (see ../src/index.js). Renders one
// WR compilation end to end, then exits:
//
//   intro card -> [title card -> clip] x N -> upload to R2 -> (YouTube)
//
// The container has no R2 or D1 credentials of its own. It talks to them
// through plain-HTTP virtual hosts that the Worker intercepts with
// outboundByHost handlers (r2.internal, status.internal, youtube.internal),
// so the only secret the container ever sees is a short-lived YouTube
// access token, and only when YouTube uploads are configured.
//
// Each segment is encoded to identical H.264 settings with uncompressed PCM
// audio, then the segments are joined with ffmpeg's concat demuxer (video
// stream-copied, audio encoded to AAC once). Keeping AAC out of the
// per-segment files avoids the encoder-priming gap AAC adds at the start of
// every file, which would otherwise drift the audio out of sync a little
// more with each of the ~50 joins.

import { spawn } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import path from "node:path"

const WIDTH = 1920
const HEIGHT = 1080
const FPS = 60
const AUDIO_RATE = 48000

const INTRO_SECONDS = 3
const CARD_SECONDS = 2
const TEXT_FADE_SECONDS = 0.5
const CLIP_FADE_SECONDS = 0.5

// R2 requires every multipart part except the last to be the same size,
// and at least 5 MiB.
const UPLOAD_PART_BYTES = 16 * 1024 * 1024

const R2_BASE = process.env.R2_BASE || "http://r2.internal"
const STATUS_URL = process.env.STATUS_URL || "http://status.internal/"
const YOUTUBE_TOKEN_URL = process.env.YOUTUBE_TOKEN_URL || "http://youtube.internal/token"
const WORK_DIR = process.env.WORK_DIR || "/work"
const FONT_LATIN = process.env.FONT_LATIN || "/usr/share/fonts/geist/Geist-Bold.ttf"
const FONT_LATIN_LABEL = process.env.FONT_LATIN_LABEL || "/usr/share/fonts/geist/Geist-SemiBold.ttf"
const FONT_CJK = process.env.FONT_CJK || "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

const VIDEO_ENCODE_ARGS = [
  "-c:v", "libx264",
  "-preset", process.env.X264_PRESET || "fast",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-profile:v", "high",
  "-r", String(FPS),
  "-g", String(FPS * 2),
  "-video_track_timescale", String(FPS * 1000),
]
const AUDIO_SEGMENT_ARGS = ["-c:a", "pcm_s16le", "-ar", String(AUDIO_RATE), "-ac", "2"]

function readJob() {
  const raw = process.env.JOB_JSON
  if (!raw) {
    throw new Error("JOB_JSON is not set")
  }

  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
}

async function reportStatus(jobId, update) {
  try {
    const response = await fetch(STATUS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: jobId, ...update }),
    })
    if (!response.ok) {
      console.error(`Status update failed: ${response.status} ${await response.text().catch(() => "")}`)
    }
  } catch (error) {
    // A lost progress update shouldn't kill a render that is otherwise fine.
    console.error("Status update request failed:", error)
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
      // ffmpeg is chatty; only the tail matters for an error message.
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`))
      }
    })
  })
}

async function probe(file) {
  const output = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,duration:format=duration",
    "-of", "json",
    file,
  ])
  const info = JSON.parse(output)
  const streams = info.streams || []
  const video = streams.find((stream) => stream.codec_type === "video")
  const hasAudio = streams.some((stream) => stream.codec_type === "audio")
  const duration = Number(video?.duration) || Number(info.format?.duration) || 0

  return { hasVideo: Boolean(video), hasAudio, duration }
}

// Geist (the site font) has no Hangul/CJK glyphs, and drawtext has no font
// fallback, so any text outside Latin goes to Noto Sans CJK instead.
function fontFor(text, latinFont) {
  return /^[\u0000-ɏ -⁯]*$/.test(text) ? latinFont : FONT_CJK
}

// Text is passed to drawtext through a file (textfile=) with expansion off,
// so player names can contain quotes, colons, % etc. without any escaping.
// Only the file *path* goes into the filtergraph, and we control that.
async function writeTextFile(name, text) {
  const file = path.join(WORK_DIR, `${name}.txt`)
  await writeFile(file, text, "utf8")
  return file
}

function fadingTextFilter(textFile, font, fontSize, duration) {
  const fadeOutStart = duration - TEXT_FADE_SECONDS
  const alpha =
    `if(lt(t\\,${TEXT_FADE_SECONDS})\\,t/${TEXT_FADE_SECONDS}\\,` +
    `if(lt(t\\,${fadeOutStart})\\,1\\,max(0\\,(${duration}-t)/${TEXT_FADE_SECONDS})))`

  return [
    `drawtext=fontfile=${font}`,
    `textfile=${textFile}`,
    "expansion=none",
    `fontsize=${fontSize}`,
    "fontcolor=white",
    "x=(w-text_w)/2",
    "y=(h-text_h)/2",
    `alpha='${alpha}'`,
  ].join(":")
}

// A black card with centred text that fades in, holds, and fades out.
async function renderCard(name, text, duration, fontSize, output) {
  const textFile = await writeTextFile(name, text)
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}`,
    "-f", "lavfi", "-i", `anullsrc=r=${AUDIO_RATE}:cl=stereo`,
    "-filter_complex", `[0:v]${fadingTextFilter(textFile, fontFor(text, FONT_LATIN), fontSize, duration)},format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a",
    "-t", String(duration),
    ...VIDEO_ENCODE_ARGS,
    ...AUDIO_SEGMENT_ARGS,
    output,
  ])
}

// One WR clip: letterboxed to 1080p60, "name (score)" bottom-left, and a
// fade in from / out to black on both picture and sound.
async function renderClip(index, source, label, output) {
  const info = await probe(source)
  if (!info.hasVideo || info.duration <= CLIP_FADE_SECONDS * 2) {
    throw new Error("video has no usable video stream")
  }

  const duration = info.duration
  const fadeOutStart = Math.max(0, duration - CLIP_FADE_SECONDS)
  const labelFile = await writeTextFile(`label-${index}`, label)

  const videoFilter = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    `fps=${FPS}`,
    [
      `drawtext=fontfile=${fontFor(label, FONT_LATIN_LABEL)}`,
      `textfile=${labelFile}`,
      "expansion=none",
      "fontsize=44",
      "fontcolor=white",
      "x=48",
      "y=h-text_h-48",
      "box=1",
      "boxcolor=black@0.5",
      "boxborderw=14",
    ].join(":"),
    `fade=t=in:st=0:d=${CLIP_FADE_SECONDS}`,
    `fade=t=out:st=${fadeOutStart}:d=${CLIP_FADE_SECONDS}`,
    "format=yuv420p",
  ].join(",")

  const audioFilter = [
    `aresample=${AUDIO_RATE}`,
    "aformat=sample_fmts=s16:channel_layouts=stereo",
    `afade=t=in:st=0:d=${CLIP_FADE_SECONDS}`,
    `afade=t=out:st=${fadeOutStart}:d=${CLIP_FADE_SECONDS}`,
    // Pad so a clip whose audio track is shorter than its video still
    // fills the segment; -t below trims it back to the video length.
    "apad",
  ].join(",")

  const inputs = ["-i", source]
  let filterComplex = `[0:v]${videoFilter}[v]`
  if (info.hasAudio) {
    filterComplex += `;[0:a:0]${audioFilter}[a]`
  } else {
    inputs.push("-f", "lavfi", "-i", `anullsrc=r=${AUDIO_RATE}:cl=stereo`)
    filterComplex += `;[1:a]anull[a]`
  }

  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[v]", "-map", "[a]",
    "-t", String(duration),
    ...VIDEO_ENCODE_ARGS,
    ...AUDIO_SEGMENT_ARGS,
    output,
  ])
}

async function downloadObject(key, destination) {
  const response = await fetch(`${R2_BASE}/object/${encodeURIComponent(key)}`)
  if (response.status === 404) {
    return false
  }
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status})`)
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
  return true
}

async function r2Request(pathname, init) {
  const response = await fetch(`${R2_BASE}${pathname}`, init)
  if (!response.ok) {
    throw new Error(`R2 ${pathname} failed (${response.status}): ${await response.text().catch(() => "")}`)
  }
  return response
}

async function uploadToR2(file, key, contentType, contentDisposition) {
  const { size } = await stat(file)
  const query = (extra = {}) => new URLSearchParams({ key, ...extra }).toString()

  const created = await r2Request(`/multipart/create?${query()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType, contentDisposition }),
  })
  const { uploadId } = await created.json()

  try {
    const parts = []
    const handle = await open(file, "r")
    try {
      for (let offset = 0, partNumber = 1; offset < size; offset += UPLOAD_PART_BYTES, partNumber += 1) {
        const length = Math.min(UPLOAD_PART_BYTES, size - offset)
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, offset)

        const response = await r2Request(`/multipart/part?${query({ uploadId, partNumber: String(partNumber) })}`, {
          method: "PUT",
          headers: { "content-length": String(length) },
          body: buffer,
        })
        parts.push(await response.json())
      }
    } finally {
      await handle.close()
    }

    await r2Request(`/multipart/complete?${query({ uploadId })}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts }),
    })
  } catch (error) {
    await fetch(`${R2_BASE}/multipart/abort?${query({ uploadId })}`, { method: "POST" }).catch(() => {})
    throw error
  }

  return size
}

function formatTimestamp(seconds) {
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = String(whole % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`
}

function buildYouTubeDescription(job, chapters) {
  const lines = chapters.map((chapter) => `${formatTimestamp(chapter.start)} ${chapter.label}`)
  return [`Every Parkour Reborn trial world record, as of ${job.asOf}.`, "", ...lines].join("\n")
}

// Resumable upload straight from the container to YouTube. The access token
// comes from the Worker (which holds the OAuth client secret and refresh
// token), so the long-lived credentials never enter the container.
async function uploadToYouTube(job, file, chapters) {
  const tokenResponse = await fetch(YOUTUBE_TOKEN_URL, { method: "POST" })
  if (!tokenResponse.ok) {
    throw new Error(`could not get a YouTube access token (${tokenResponse.status}): ${await tokenResponse.text().catch(() => "")}`)
  }
  const { access_token: accessToken } = await tokenResponse.json()
  const { size } = await stat(file)

  const session = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(size),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify({
      snippet: {
        title: job.title.slice(0, 100),
        description: buildYouTubeDescription(job, chapters).slice(0, 5000),
        categoryId: "20", // Gaming
      },
      status: {
        privacyStatus: job.youtube.privacy,
        selfDeclaredMadeForKids: false,
      },
    }),
  })
  const uploadUrl = session.headers.get("location")
  if (!session.ok || !uploadUrl) {
    throw new Error(`YouTube rejected the upload session (${session.status}): ${await session.text().catch(() => "")}`)
  }

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(size) },
    body: Readable.toWeb(createReadStream(file)),
    duplex: "half",
  })
  if (!upload.ok) {
    throw new Error(`YouTube upload failed (${upload.status}): ${await upload.text().catch(() => "")}`)
  }

  const video = await upload.json()
  return { id: video.id, url: `https://www.youtube.com/watch?v=${video.id}` }
}

async function main() {
  const job = readJob()
  const total = job.entries.length
  const segmentsDir = path.join(WORK_DIR, "segments")
  const sourcesDir = path.join(WORK_DIR, "sources")
  await mkdir(segmentsDir, { recursive: true })
  await mkdir(sourcesDir, { recursive: true })

  await reportStatus(job.id, { status: "rendering", progress_done: 0, progress_total: total })

  const segments = []
  const chapters = []
  const skipped = []
  let cursor = 0

  const intro = path.join(segmentsDir, "000-intro.mov")
  await renderCard("intro", job.title, INTRO_SECONDS, 110, intro)
  segments.push(intro)
  chapters.push({ start: 0, label: "Intro" })
  cursor += (await probe(intro)).duration

  for (let index = 0; index < total; index += 1) {
    const entry = job.entries[index]
    const prefix = String(index + 1).padStart(3, "0")
    const source = path.join(sourcesDir, `${prefix}.mp4`)
    const card = path.join(segmentsDir, `${prefix}-a-card.mov`)
    const clip = path.join(segmentsDir, `${prefix}-b-clip.mov`)
    const timeText = Number(entry.time).toFixed(3)

    try {
      const found = await downloadObject(entry.videoKey, source)
      if (!found) {
        throw new Error("video not found in R2")
      }

      await renderCard(`card-${index}`, `${entry.trial} ${timeText}`, CARD_SECONDS, 96, card)
      await renderClip(index, source, `${entry.playerName} (${Number(entry.playerScore).toFixed(3)})`, clip)

      segments.push(card, clip)
      chapters.push({ start: cursor, label: `${entry.trial} - ${entry.playerName} ${timeText}` })
      cursor += (await probe(card)).duration + (await probe(clip)).duration
    } catch (error) {
      console.error(`Skipping ${entry.trial}:`, error)
      skipped.push({ trial: entry.trial, reason: String(error?.message || error).slice(0, 300) })
      await rm(card, { force: true })
      await rm(clip, { force: true })
    } finally {
      await rm(source, { force: true })
    }

    await reportStatus(job.id, { status: "rendering", progress_done: index + 1, progress_total: total, skipped })
  }

  if (segments.length === 1) {
    throw new Error("None of the world record videos could be rendered")
  }

  await reportStatus(job.id, { status: "uploading", progress_done: total, progress_total: total, skipped })

  const listFile = path.join(WORK_DIR, "segments.txt")
  await writeFile(listFile, segments.map((file) => `file '${file}'`).join("\n"), "utf8")
  const finalFile = path.join(WORK_DIR, "compilation.mp4")
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", String(AUDIO_RATE),
    "-video_track_timescale", String(FPS * 1000),
    "-movflags", "+faststart",
    finalFile,
  ])
  await rm(segmentsDir, { recursive: true, force: true })

  const finalInfo = await probe(finalFile)
  const sizeBytes = await uploadToR2(
    finalFile,
    job.objectKey,
    "video/mp4",
    `attachment; filename="${job.downloadFilename}"`
  )

  let youtube = null
  let youtubeError = null
  if (job.youtube?.enabled) {
    try {
      youtube = await uploadToYouTube(job, finalFile, chapters)
    } catch (error) {
      // The R2 copy is already safe; a YouTube failure is reported but
      // doesn't fail the whole job.
      console.error("YouTube upload failed:", error)
      youtubeError = String(error?.message || error).slice(0, 1000)
    }
  }

  await reportStatus(job.id, {
    status: "done",
    progress_done: total,
    progress_total: total,
    skipped,
    duration_seconds: finalInfo.duration,
    size_bytes: sizeBytes,
    chapters,
    youtube_video_id: youtube?.id ?? null,
    youtube_url: youtube?.url ?? null,
    youtube_error: youtubeError,
  })
}

let jobId = null
try {
  jobId = readJob().id
  await main()
  process.exit(0)
} catch (error) {
  console.error("Compilation failed:", error)
  if (jobId) {
    await reportStatus(jobId, { status: "failed", error: String(error?.message || error).slice(0, 2000) })
  }
  process.exit(1)
}
