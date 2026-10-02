// Runs inside the compilation container (see ../src/index.js). Renders one
// WR compilation end to end, then exits:
//
//   intro card -> [title card -> clip] x N -> upload to R2
//
// The container has no R2 or D1 credentials of its own. It talks to them
// through plain-HTTP virtual hosts that the Worker intercepts with
// outboundByHost handlers (r2.internal, status.internal), and it has no
// other network access.
//
// Each segment is encoded to identical H.264 settings with uncompressed PCM
// audio, then the segments are joined with ffmpeg's concat demuxer (video
// stream-copied, audio encoded to AAC once). Keeping AAC out of the
// per-segment files avoids the encoder-priming gap AAC adds at the start of
// every file, which would otherwise drift the audio out of sync a little
// more with each of the ~50 joins.

import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { ShutdownError, isShuttingDown, onShutdown, readJob, run, saveResponse, uploadMultipart } from "./lib.mjs"

const WIDTH = 1920
const HEIGHT = 1080
const FPS = 60
const AUDIO_RATE = 48000

const INTRO_SECONDS = 3
const CARD_SECONDS = 2
const TEXT_FADE_SECONDS = 0.5
const CLIP_FADE_SECONDS = 0.5

const R2_BASE = process.env.R2_BASE || "http://r2.internal"
const STATUS_URL = process.env.STATUS_URL || "http://status.internal/"
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

async function probe(file) {
  const output = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file])
  const info = JSON.parse(output)
  const streams = info.streams || []
  // Skip cover art ("attached picture" streams): a still image that some
  // muxers list as a video stream, sometimes before the real one.
  const video = streams.find((stream) => stream.codec_type === "video" && !stream.disposition?.attached_pic)
  const audio = streams.find((stream) => stream.codec_type === "audio")
  const duration = Number(video?.duration) || Number(info.format?.duration) || 0

  // ffmpeg only shifts timestamps by the file's *earliest* stream, so a
  // video track that starts after its audio (or after an empty edit) keeps
  // that offset into the filtergraph. Measured here so the clip can be
  // re-based to 0 with audio kept in sync (see renderClip).
  const formatStart = Number(info.format?.start_time) || 0
  const videoOffset = Math.max(0, (Number(video?.start_time) || formatStart) - formatStart)

  return {
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoIndex: video?.index ?? null,
    audioIndex: audio?.index ?? null,
    duration,
    videoOffset,
  }
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

function labelFilter(font, textFile, x) {
  return [
    `drawtext=fontfile=${font}`,
    `textfile=${textFile}`,
    "expansion=none",
    "fontsize=44",
    "fontcolor=white",
    `x=${x}`,
    "y=h-text_h-48",
    "box=1",
    "boxcolor=black@0.5",
    "boxborderw=14",
  ].join(":")
}

// One WR clip: letterboxed to 1080p60, "name (score)" bottom-left, how long
// it has been the WR ("259 days") bottom-right in the same style, and a fade
// in from / out to black on both picture and sound.
async function renderClip(index, source, label, heldFor, output) {
  const info = await probe(source)
  if (!info.hasVideo || info.duration <= CLIP_FADE_SECONDS * 2) {
    throw new Error("video has no usable video stream")
  }

  const duration = info.duration
  const fadeOutStart = Math.max(0, duration - CLIP_FADE_SECONDS)
  const labelFile = await writeTextFile(`label-${index}`, label)
  const heldForFile = heldFor ? await writeTextFile(`held-${index}`, heldFor) : null

  // The fades work on frame timestamps, so they must start at 0. A video
  // track that started late used to keep its offset here, which put every
  // frame past the fade-out: the whole clip rendered black.
  const videoFilter = [
    "setpts=PTS-STARTPTS",
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    `fps=${FPS}`,
    labelFilter(fontFor(label, FONT_LATIN_LABEL), labelFile, "48"),
    ...(heldForFile ? [labelFilter(FONT_LATIN_LABEL, heldForFile, "w-text_w-48")] : []),
    `fade=t=in:st=0:d=${CLIP_FADE_SECONDS}`,
    `fade=t=out:st=${fadeOutStart}:d=${CLIP_FADE_SECONDS}`,
    "format=yuv420p",
  ].join(",")

  const audioFilter = [
    // Shift audio by the same offset the video was re-based by, so they
    // stay in sync; drop audio from before the video starts, and pad
    // silence if the audio starts after it.
    `asetpts=PTS-${info.videoOffset.toFixed(6)}/TB`,
    "atrim=start=0",
    `aresample=${AUDIO_RATE}:async=1:first_pts=0`,
    "aformat=sample_fmts=s16:channel_layouts=stereo",
    `afade=t=in:st=0:d=${CLIP_FADE_SECONDS}`,
    `afade=t=out:st=${fadeOutStart}:d=${CLIP_FADE_SECONDS}`,
    // Pad so a clip whose audio track is shorter than its video still
    // fills the segment; -t below trims it back to the video length.
    "apad",
  ].join(",")

  const inputs = ["-i", source]
  let filterComplex = `[0:${info.videoIndex}]${videoFilter}[v]`
  if (info.hasAudio) {
    filterComplex += `;[0:${info.audioIndex}]${audioFilter}[a]`
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

  await saveResponse(response, destination)
  return true
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
      await renderClip(index, source, `${entry.playerName} (${Number(entry.playerScore).toFixed(3)})`, entry.heldFor, clip)

      segments.push(card, clip)
      chapters.push({ start: cursor, label: `${entry.trial} - ${entry.playerName} ${timeText}` })
      cursor += (await probe(card)).duration + (await probe(clip)).duration
    } catch (error) {
      // A stopped container isn't a broken clip: fail the whole render
      // rather than publish a video with clips silently missing.
      if (error instanceof ShutdownError || isShuttingDown()) {
        throw error
      }
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
  // The Worker writes this to the job's own compilations/ key; the
  // container never chooses where it lands.
  const sizeBytes = await uploadMultipart(`${R2_BASE}/compilation/multipart`, finalFile, {
    contentType: "video/mp4",
    contentDisposition: `attachment; filename="${job.downloadFilename}"`,
  })

  await reportStatus(job.id, {
    status: "done",
    progress_done: total,
    progress_total: total,
    skipped,
    duration_seconds: finalInfo.duration,
    size_bytes: sizeBytes,
    chapters,
  })
}

let jobId = null
onShutdown(async () => {
  if (jobId) {
    await reportStatus(jobId, { status: "failed", error: `${new ShutdownError().message} Generate it again.` })
  }
})
try {
  jobId = readJob().id
  await main()
  process.exit(0)
} catch (error) {
  console.error("Compilation failed:", error)
  if (isShuttingDown()) {
    // onShutdown reports and exits; don't race it with a second report.
    await new Promise(() => {})
  }
  if (jobId) {
    await reportStatus(jobId, { status: "failed", error: String(error?.message || error).slice(0, 2000) })
  }
  process.exit(1)
}
