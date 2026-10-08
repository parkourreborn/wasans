import { trials, type TrialName } from "@/lib/trials"

// Client-side checks for the submit form. The server is the authority;
// these mirror its rules so problems show up next to the field instead of
// as an error after a long upload.

export const MAX_RUNS_PER_SUBMISSION = 32

// What the time field accepts while typing: digits and up to three decimals.
export const TIME_DRAFT_PATTERN = /^\d*(\.\d{0,3})?$/

// A finished time: positive, at most three decimals.
export function parseRunTime(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    return null
  }
  const time = Number(trimmed)
  return time > 0 ? time : null
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Longest names first, so a name that contains another is matched whole.
const trialsByLength = [...trials].sort((a, b) => b.length - a.length)

// Reads the trial and time out of a video's file name when they're in it,
// e.g. "Neon Bold 24.512.mp4" or "glass_12.345_pb.mov". Only numbers with a
// decimal point count as times, so dates and resolutions in the name
// ("2026-10-07", "1080p") aren't mistaken for one.
export function parseRunFilename(filename: string): { trialName?: TrialName; time?: string } {
  const base = filename.replace(/\.[a-z0-9]{2,4}$/i, "")
  const result: { trialName?: TrialName; time?: string } = {}

  const flat = normalize(base)
  result.trialName = trialsByLength.find((trial) => flat.includes(normalize(trial)))

  for (const match of base.matchAll(/(?<![\d.])(\d{1,3}\.\d{1,3})(?![\d.])/g)) {
    const time = parseRunTime(match[1])
    if (time !== null && time < 1000) {
      result.time = match[1]
      break
    }
  }

  return result
}

// medal.tv clip links, the only proof links trial runs accept.
export function isMedalClipUrl(value: string) {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()
    return url.protocol === "https:" && (host === "medal.tv" || host === "www.medal.tv") && /\/clips\/[^/?]+/.test(url.pathname)
  } catch {
    return false
  }
}

const youtubeHosts = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"]

// Combo proof: an https YouTube link.
export function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" && youtubeHosts.includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
