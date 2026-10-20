"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import {
  KeyboardIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  StepBackIcon,
  StepForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"

// The site's video player. Every control sits in the bar under the
// picture, never on it, so no part of the frame is ever covered: timers and
// HUDs live in the corners, and moderators need to read them. The timeline
// is a filmstrip. Dragging it seeks the video itself, so the picture shows
// the exact frame under the playhead; hovering it previews the frame under
// the cursor without moving the video.

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const SEEK_SECONDS = 5
// Frame stepping needs the frame rate. Runs pass the one the server probed;
// otherwise it's measured while the video plays, and assumed until then.
const FALLBACK_FPS = 60
// The timeline's height (h-11), which sizes the filmstrip's tiles.
const STRIP_HEIGHT = 44
const MAX_TILES = 16
const VOLUME_KEY = "wasans:player-volume"

const SHORTCUTS: [keys: string[], action: string][] = [
  [["Space"], "Play or pause"],
  [["←", "→"], `Back or forward ${SEEK_SECONDS}s`],
  [[",", "."], "Previous or next frame"],
  [["<", ">"], "Slower or faster"],
  [["0–9"], "Jump through the video"],
  [["M"], "Mute"],
  [["F"], "Fullscreen"],
]

type Ranges = readonly (readonly [start: number, end: number])[]

// What the player tracks outside React, because it changes every frame or
// has to be read synchronously in the middle of a gesture.
type Live = {
  // The newest time a seek asked for, until the video lands there, and the
  // one waiting for the seek in flight. Scrubbing asks far faster than a
  // video can seek, so only the newest position ever waits.
  target: number | null
  queued: number | null
  // The frame on screen (from requestVideoFrameCallback) and the frame rate
  // measured during playback, for frame stepping.
  frameTime: number
  measuredFps: number
  // Play again when the scrub ends.
  resume: boolean
  // The last whole second given to screen readers.
  second: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// 75.5 -> "1:15.500". Milliseconds, like run times, so a frame's time can
// be read straight off the player.
function formatClock(seconds: number) {
  const ms = Math.round((Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000)
  const minutes = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${minutes}:${String(secs).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`
}

function readBuffered(video: HTMLVideoElement): Ranges {
  return Array.from({ length: video.buffered.length }, (_, index) => [video.buffered.start(index), video.buffered.end(index)] as const)
}

function readSavedVolume() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VOLUME_KEY) ?? "null") as { volume?: unknown; muted?: unknown } | null
    if (saved && typeof saved.volume === "number") {
      return { volume: clamp(saved.volume, 0, 1), muted: saved.muted === true }
    }
  } catch {
    // Blocked or garbled storage: start at full volume.
  }
  return null
}

function saveVolume(volume: number, muted: boolean) {
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted }))
  } catch {
    // Storage can be blocked; the volume just won't carry over.
  }
}

// Save-Data asks for nothing extra, and the filmstrip is extra downloading.
function wantsLessData() {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
}

// Draws the video's current frame over the whole canvas at its on-screen
// size, cropped like object-cover.
function drawFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(canvas.clientWidth * ratio)
  const height = Math.round(canvas.clientHeight * ratio)
  const context = canvas.isConnected ? canvas.getContext("2d") : null
  if (!context || !width || !height || !video.videoWidth || !video.videoHeight) return false
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  context.imageSmoothingQuality = "high"
  context.drawImage(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height)
  return true
}

type FrameJob = { time: number; canvas: HTMLCanvasElement }

// A hidden second copy of the video that seeks around drawing frames for
// the filmstrip and the hover preview, so the one being watched never
// moves. One seek at a time; the hover preview jumps the queue, and only its
// newest position is kept. The canvases are only ever displayed, never read
// back, so the copy needs no CORS.
class FrameGrabber {
  private readonly video = document.createElement("video")
  private readonly loaded: Promise<void>
  private tiles: FrameJob[] = []
  private peek: FrameJob | null = null
  private running = false
  private stopped = false

  constructor(src: string) {
    const video = this.video
    video.muted = true
    video.playsInline = true
    video.preload = "metadata"
    this.loaded = new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true })
      video.addEventListener("error", () => reject(new Error("The preview copy couldn't load")), { once: true })
    })
    video.src = src
  }

  drawTiles(jobs: FrameJob[]) {
    this.tiles = jobs
    void this.run()
  }

  preview(job: FrameJob) {
    this.peek = job
    void this.run()
  }

  stop() {
    this.stopped = true
    this.tiles = []
    this.peek = null
    this.video.removeAttribute("src")
    this.video.load()
  }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      await this.loaded
      while (!this.stopped) {
        const job = this.peek ?? this.tiles.shift()
        if (!job) break
        if (job === this.peek) this.peek = null
        await this.seek(job.time)
        if (!this.stopped && drawFrame(this.video, job.canvas)) job.canvas.dataset.ready = ""
      }
    } catch {
      // The copy couldn't load. The strip stays blank and the player works
      // without it.
    } finally {
      this.running = false
    }
  }

  private seek(time: number) {
    const video = this.video
    return new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer)
        video.removeEventListener("seeked", done)
        resolve()
      }
      // A seek that never lands shouldn't stall the rest of the strip.
      const timer = window.setTimeout(done, 4000)
      video.addEventListener("seeked", done)
      video.currentTime = time
    })
  }
}

export function VideoPlayer({
  src,
  poster,
  label,
  fps,
  previews = true,
  onError,
  className,
}: {
  src: string
  poster?: string
  label: string
  // Frames per second, when known, for stepping one frame at a time.
  fps?: number | null
  // Whether the timeline may load frames of its own, which downloads parts
  // of the video a second time. Off for viewers who turned thumbnails off.
  previews?: boolean
  onError?: () => void
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const liveRef = useRef<Live>({ target: null, queued: null, frameTime: -1, measuredFps: 0, resume: false, second: -1 })

  const [paused, setPaused] = useState(true)
  const [ended, setEnded] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [duration, setDuration] = useState(0)
  const [aspect, setAspect] = useState(16 / 9)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [buffered, setBuffered] = useState<Ranges>([])
  const [fullscreen, setFullscreen] = useState(false)
  const [scrubResume, setScrubResume] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  // The filmstrip waits until someone shows interest in the player.
  const [engaged, setEngaged] = useState(false)

  // Moves the playhead and the clock. It runs every frame during playback,
  // so it writes to the DOM rather than re-rendering.
  const paint = (time?: number) => {
    const video = videoRef.current
    if (!video) return
    const live = liveRef.current
    const now = time ?? live.target ?? video.currentTime
    const total = Number.isFinite(video.duration) ? video.duration : 0
    rootRef.current?.style.setProperty("--progress", String(total > 0 ? clamp(now / total, 0, 1) : 0))
    if (clockRef.current) clockRef.current.textContent = formatClock(now)
    const second = Math.floor(now)
    if (second !== live.second && sliderRef.current) {
      live.second = second
      sliderRef.current.setAttribute("aria-valuenow", String(second))
      sliderRef.current.setAttribute("aria-valuetext", `${formatClock(now)} of ${formatClock(total)}`)
    }
  }
  const paintFrame = useEffectEvent(() => paint())

  useEffect(() => {
    if (paused) return
    let frame = requestAnimationFrame(function tick() {
      paintFrame()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [paused])

  useEffect(() => {
    const video = videoRef.current
    const saved = readSavedVolume()
    if (video && saved) {
      video.volume = saved.volume
      video.muted = saved.muted
    }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === rootRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // Follows the frame on screen and, during normal-speed playback, how far
  // apart frames are.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !("requestVideoFrameCallback" in video)) return
    const live = liveRef.current
    const gaps: number[] = []
    let last: VideoFrameCallbackMetadata | null = null
    let handle = 0
    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      live.frameTime = frame.mediaTime
      if (last && frame.presentedFrames === last.presentedFrames + 1 && !video.paused && video.playbackRate === 1 && gaps.length < 120) {
        const gap = frame.mediaTime - last.mediaTime
        if (gap > 1 / 250 && gap < 1 / 10) {
          gaps.push(gap)
          live.measuredFps = 1 / median(gaps)
        }
      }
      last = frame
      handle = video.requestVideoFrameCallback(onFrame)
    }
    handle = video.requestVideoFrameCallback(onFrame)
    return () => video.cancelVideoFrameCallback(handle)
  }, [])

  const engage = () => {
    if (!engaged && previews && !wantsLessData()) setEngaged(true)
  }

  const seekTo = (time: number) => {
    const video = videoRef.current
    if (!video || !(video.duration > 0)) return
    const live = liveRef.current
    const target = clamp(time, 0, video.duration)
    live.target = target
    if (video.seeking) live.queued = target
    else video.currentTime = target
    paint(target)
  }

  const onSeeked = () => {
    const video = videoRef.current
    if (!video) return
    const live = liveRef.current
    if (live.queued !== null) {
      video.currentTime = live.queued
      live.queued = null
      return
    }
    live.target = null
    setEnded(video.ended)
    paint()
  }

  const seekBy = (seconds: number) => {
    const video = videoRef.current
    if (video) seekTo((liveRef.current.target ?? video.currentTime) + seconds)
  }

  const stepFrame = (direction: 1 | -1) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    const live = liveRef.current
    const frame = 1 / (fps || live.measuredFps || FALLBACK_FPS)
    // Step from the middle of the frame on screen, so landing one frame
    // away can't round back into the same one.
    const onScreen = live.frameTime >= 0 && Math.abs(video.currentTime - live.frameTime) < frame ? live.frameTime + frame / 2 : video.currentTime
    seekTo((live.target ?? onScreen) + direction * frame)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) void video.play().catch(() => {})
    else video.pause()
  }

  const setSpeed = (speed: number) => {
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }

  const nudgeSpeed = (direction: 1 | -1) => {
    const index = SPEEDS.findIndex((speed) => speed >= rate)
    setSpeed(SPEEDS[clamp((index === -1 ? SPEEDS.length - 1 : index) + direction, 0, SPEEDS.length - 1)])
  }

  const changeVolume = (value: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    video.muted = value === 0
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = 0.5
      video.muted = false
    } else {
      video.muted = true
    }
  }

  const toggleFullscreen = () => {
    const root = rootRef.current
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else if (root?.requestFullscreen) void root.requestFullscreen().catch(() => {})
    // iPhones only take the video itself fullscreen, with their own controls.
    else video?.webkitEnterFullscreen?.()
  }

  const startScrub = (time: number) => {
    const video = videoRef.current
    if (!video) return
    const resume = !video.paused && !video.ended
    liveRef.current.resume = resume
    setScrubResume(resume)
    video.pause()
    seekTo(time)
  }

  const endScrub = () => {
    const live = liveRef.current
    setScrubResume(false)
    if (live.resume) void videoRef.current?.play().catch(() => {})
    live.resume = false
  }

  // Shortcuts work while focus is anywhere in the player, so they never
  // fight the page's own (the review queue's letter keys pass straight
  // through).
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const video = videoRef.current
    if (!video) return
    // The volume slider keeps its own arrow, Home and End keys.
    if (event.target instanceof HTMLInputElement && /^(Arrow|Home|End|Page)/.test(event.key)) return
    switch (event.key) {
      case " ":
        if (!event.repeat) togglePlay()
        break
      case "ArrowLeft":
        seekBy(-SEEK_SECONDS)
        break
      case "ArrowRight":
        seekBy(SEEK_SECONDS)
        break
      case ",":
        stepFrame(-1)
        break
      case ".":
        stepFrame(1)
        break
      case "<":
        nudgeSpeed(-1)
        break
      case ">":
        nudgeSpeed(1)
        break
      case "Home":
        seekTo(0)
        break
      case "End":
        seekTo(video.duration)
        break
      case "m":
      case "M":
        if (!event.repeat) toggleMute()
        break
      case "f":
      case "F":
        if (!event.repeat) toggleFullscreen()
        break
      default:
        if (!/^[0-9]$/.test(event.key)) return
        seekTo((Number(event.key) / 10) * video.duration)
    }
    event.preventDefault()
  }

  const playing = !paused || scrubResume
  const silent = muted || volume === 0
  const VolumeIcon = silent ? VolumeXIcon : volume < 0.5 ? Volume1Icon : Volume2Icon
  const playLabel = playing ? "Pause" : ended ? "Replay" : "Play"

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Video player"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerEnter={engage}
      onFocus={engage}
      className={cn(
        "flex w-full flex-col overflow-hidden bg-surface outline-none [--progress:0]",
        fullscreen ? "h-full" : "rounded-lg border border-line-strong",
        className
      )}
    >
      <div className={cn("relative bg-black", fullscreen ? "min-h-0 flex-1" : "aspect-video")}>
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          aria-label={label}
          onClick={() => {
            togglePlay()
            rootRef.current?.focus({ preventScroll: true })
          }}
          onDoubleClick={toggleFullscreen}
          onPlay={() => {
            setPaused(false)
            setEnded(false)
            engage()
          }}
          onPause={() => setPaused(true)}
          onEnded={() => setEnded(true)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            setDuration(Number.isFinite(video.duration) ? video.duration : 0)
            if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
            paint()
          }}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => {
            if (event.currentTarget.paused) paint()
          }}
          onSeeked={onSeeked}
          onProgress={(event) => setBuffered(readBuffered(event.currentTarget))}
          onVolumeChange={(event) => {
            const video = event.currentTarget
            setVolume(video.volume)
            setMuted(video.muted)
            saveVolume(video.volume, video.muted)
          }}
          onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
          onError={onError}
          className="block size-full cursor-pointer bg-black object-contain"
        />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line px-3 pb-2 pt-3.5">
        <Timeline
          sliderRef={sliderRef}
          src={src}
          duration={duration}
          aspect={aspect}
          buffered={buffered}
          previews={previews && engaged}
          onScrubStart={startScrub}
          onScrub={seekTo}
          onScrubEnd={endScrub}
        />

        <div className="flex items-center gap-1">
          <Button type="button" size="icon" onClick={togglePlay} aria-label={playLabel} title={`${playLabel} (Space)`} className="rounded-full">
            {waiting && playing ? (
              <Spinner />
            ) : playing ? (
              <PauseIcon className="fill-current" />
            ) : ended ? (
              <RotateCcwIcon />
            ) : (
              <PlayIcon className="translate-x-px fill-current" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!duration}
            onClick={() => stepFrame(-1)}
            aria-label="Previous frame"
            title="Previous frame (,)"
            className="text-muted-foreground max-sm:hidden"
          >
            <StepBackIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!duration}
            onClick={() => stepFrame(1)}
            aria-label="Next frame"
            title="Next frame (.)"
            className="text-muted-foreground max-sm:hidden"
          >
            <StepForwardIcon />
          </Button>
          <p className={cn("num m-0 ml-1.5 whitespace-nowrap text-[12px] text-subtle-foreground sm:text-[13px]", speedOpen && "max-sm:hidden")}>
            <span ref={clockRef} className="text-foreground">
              0:00.000
            </span>{" "}
            / {formatClock(duration)}
          </p>

          <div className="ml-auto flex items-center gap-1">
            <SpeedControl rate={rate} open={speedOpen} onOpenChange={setSpeedOpen} onChange={setSpeed} />
            <div className="group/volume flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                aria-label={silent ? "Unmute" : "Mute"}
                title={`${silent ? "Unmute" : "Mute"} (M)`}
                className="text-muted-foreground"
              >
                <VolumeIcon />
              </Button>
              <div className="flex w-0 items-center overflow-hidden opacity-0 transition-[width,opacity] duration-200 group-focus-within/volume:w-22 group-focus-within/volume:opacity-100 group-hover/volume:w-22 group-hover/volume:opacity-100 max-sm:hidden">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={silent ? 0 : volume}
                  onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                  aria-label="Volume"
                  style={{ "--volume": `${(silent ? 0 : volume) * 100}%` } as React.CSSProperties}
                  className="mx-2 h-1 w-18 cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--foreground)_var(--volume),rgb(255_255_255/0.18)_var(--volume))] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowKeys(!showKeys)}
              aria-expanded={showKeys}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              className={cn("max-sm:hidden", showKeys ? "bg-surface-3 text-foreground" : "text-muted-foreground")}
            >
              <KeyboardIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={`${fullscreen ? "Exit fullscreen" : "Fullscreen"} (F)`}
              className="text-muted-foreground"
            >
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </Button>
          </div>
        </div>

        {showKeys ? (
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 border-t border-line p-0 pb-1 pt-2.5 text-[12px] text-muted-foreground">
            {SHORTCUTS.map(([keys, action]) => (
              <li key={action} className="flex items-center gap-1.5">
                {keys.map((key) => (
                  <Kbd key={key} className="bg-surface-3 text-foreground">
                    {key}
                  </Kbd>
                ))}
                {action}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

// The filmstrip timeline. It reports drags as times and leaves seeking to
// the player; the playhead and played shading follow --progress, which the
// player sets on its root every frame.
function Timeline({
  sliderRef,
  src,
  duration,
  aspect,
  buffered,
  previews,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  sliderRef: React.RefObject<HTMLDivElement | null>
  src: string
  duration: number
  aspect: number
  buffered: Ranges
  // Whether to load frames for the filmstrip and the hover preview.
  previews: boolean
  onScrubStart: (time: number) => void
  onScrub: (time: number) => void
  onScrubEnd: () => void
}) {
  const grabberRef = useRef<FrameGrabber | null>(null)
  const tileRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const peekRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)
  const [width, setWidth] = useState(0)
  // Where the cursor is, as a fraction of the strip. Kept after it leaves so
  // the preview fades out in place.
  const [hover, setHover] = useState({ at: 0, shown: false })
  const [drag, setDrag] = useState<number | null>(null)

  const ready = duration > 0
  // Very tall or very wide video is cropped into tiles of a sane shape.
  const tileAspect = clamp(aspect, 1, 2)
  const tileCount = width > 0 ? clamp(Math.round(width / (STRIP_HEIGHT * tileAspect)), 4, MAX_TILES) : 0
  const peekWidth = previews ? Math.round((STRIP_HEIGHT + 8) * tileAspect) : 64
  const peekLeft = clamp(hover.at * width - peekWidth / 2, 0, Math.max(0, width - peekWidth))
  const peeking = hover.shown && drag === null

  useEffect(() => {
    const slider = sliderRef.current
    if (!slider) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(slider)
    return () => observer.disconnect()
  }, [sliderRef])

  useEffect(() => {
    if (!previews) return
    const grabber = new FrameGrabber(src)
    grabberRef.current = grabber
    return () => {
      grabber.stop()
      grabberRef.current = null
    }
  }, [previews, src])

  // Runs after the grabber above is made, so a new one starts on the tiles.
  useEffect(() => {
    const grabber = grabberRef.current
    if (!previews || !grabber || duration <= 0 || tileCount === 0) return
    const jobs: FrameJob[] = []
    for (let index = 0; index < tileCount; index++) {
      const canvas = tileRefs.current[index]
      if (canvas) jobs.push({ canvas, time: ((index + 0.5) / tileCount) * duration })
    }
    grabber.drawTiles(jobs)
  }, [previews, src, duration, tileCount])

  useEffect(() => {
    const canvas = peekRef.current
    if (!hover.shown || !canvas || duration <= 0) return
    grabberRef.current?.preview({ canvas, time: hover.at * duration })
  }, [hover, duration])

  const fractionAt = (clientX: number) => {
    const rect = sliderRef.current?.getBoundingClientRect()
    return rect && rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDrag(null)
    onScrubEnd()
  }

  return (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={ready ? 0 : -1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      // The player keeps this current; React only sets the starting value.
      aria-valuenow={0}
      aria-disabled={!ready || undefined}
      onPointerDown={(event) => {
        if (!ready || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        draggingRef.current = true
        const at = fractionAt(event.clientX)
        setDrag(at)
        onScrubStart(at * duration)
      }}
      onPointerMove={(event) => {
        const at = fractionAt(event.clientX)
        if (draggingRef.current) {
          setDrag(at)
          onScrub(at * duration)
        } else if (ready && event.pointerType === "mouse") {
          setHover({ at, shown: true })
        }
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onPointerLeave={() => setHover((current) => ({ ...current, shown: false }))}
      className={cn(
        "relative h-11 touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        !ready ? "cursor-default" : drag === null ? "cursor-pointer" : "cursor-grabbing"
      )}
    >
      <div className="absolute inset-0 flex gap-px overflow-hidden rounded-md bg-background ring-1 ring-line-strong">
        {Array.from({ length: tileCount }, (_, index) => (
          <div key={index} className="h-full min-w-0 flex-1 bg-surface-3">
            <canvas
              ref={(node) => {
                tileRefs.current[index] = node
              }}
              className="size-full object-cover opacity-0 transition-opacity duration-500 data-ready:opacity-100"
            />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-[calc(var(--progress)*100%)] bg-black/55" />
        {ready
          ? buffered.map(([start, end]) => (
              <div
                key={start}
                className="absolute bottom-0 h-[3px] bg-foreground/30"
                style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }}
              />
            ))
          : null}
        <div className="absolute bottom-0 left-0 h-[3px] w-[calc(var(--progress)*100%)] bg-primary" />
      </div>

      {peeking ? (
        <div aria-hidden className="pointer-events-none absolute -inset-y-1 w-px -translate-x-1/2 bg-foreground/80" style={{ left: hover.at * width }} />
      ) : null}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-y-1 z-10 flex overflow-hidden rounded-md bg-surface-3 shadow-[0_8px_24px_rgb(0_0_0/0.6)] ring-2 ring-foreground transition-opacity duration-150",
          previews ? "items-end" : "items-center",
          peeking ? "opacity-100" : "opacity-0"
        )}
        style={{ left: peekLeft, width: peekWidth }}
      >
        {previews ? <canvas ref={peekRef} className="absolute inset-0 size-full object-cover" /> : null}
        <span
          className={cn(
            "num relative w-full text-center text-[11px] leading-none text-foreground",
            previews && "bg-linear-to-t from-black/85 to-transparent pb-1 pt-3"
          )}
        >
          {formatClock(hover.at * duration)}
        </span>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-1 left-[calc(var(--progress)*100%)] z-20 w-[3px] -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.45)]"
      >
        <span
          className={cn(
            "absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.45)] transition-transform duration-150",
            drag !== null && "scale-125"
          )}
        />
      </div>
      {drag !== null ? (
        <span
          className="num pointer-events-none absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/85 px-1.5 py-1 text-[11px] leading-none text-foreground ring-1 ring-line-strong"
          style={{ left: clamp(drag * width, 32, Math.max(32, width - 32)) }}
        >
          {formatClock(drag * duration)}
        </span>
      ) : null}
    </div>
  )
}

// Speeds open inline, beside the button, rather than as a menu that would
// have to sit over the picture.
function SpeedControl({
  rate,
  open,
  onOpenChange,
  onChange,
}: {
  rate: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (rate: number) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    triggerRef.current?.focus()
    onOpenChange(false)
  }

  return (
    <div
      className="flex items-center gap-1"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) onOpenChange(false)
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault()
          close()
        }
      }}
    >
      {open ? (
        <div role="group" aria-label="Playback speed" className="flex items-center gap-0.5 rounded-md bg-surface-3 p-0.5 duration-150 animate-in fade-in-0 slide-in-from-right-2">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              aria-pressed={speed === rate}
              autoFocus={speed === rate}
              onClick={() => {
                onChange(speed)
                close()
              }}
              className={cn(
                "num h-8 min-w-9 cursor-pointer rounded-sm px-1.5 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                speed === rate ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
      ) : null}
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={`Playback speed, ${rate}×`}
        title="Playback speed (< and >)"
        className={cn("min-w-11 px-2 font-mono text-[13px] font-medium normal-case tracking-normal tabular-nums", rate === 1 ? "text-muted-foreground" : "text-primary")}
      >
        {rate}×
      </Button>
    </div>
  )
}
