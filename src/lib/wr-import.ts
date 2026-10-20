// Rules for importing world records from the old WR Google Drive folder
// (see wr-import-service.ts): reading a file's name, which date it gets,
// and what counts as the same run. No DB, no "server-only", so the server,
// the queue page and the tests share it.

// The Drive folder the old world records were kept in, offered when
// scanning.
export const DEFAULT_DRIVE_FOLDER = "https://drive.google.com/drive/folders/1mD0CQgUSLnhz2FoHAXSOHUBM7SAy78p5"

// Where a file waits in the private uploads bucket once it's copied over.
export const IMPORT_PREFIX = "imports/"

export function importKey(driveFileId: string) {
  return `${IMPORT_PREFIX}${driveFileId}`
}

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "ts", "3gp"])

function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(name)
  return match ? match[1].toLowerCase() : ""
}

export function isVideoFile(mimeType: string | null | undefined, name: string) {
  return Boolean(mimeType?.startsWith("video/")) || VIDEO_EXTENSIONS.has(extensionOf(name))
}

// A Drive folder link (or a bare folder id) to the folder's id.
export function driveFolderId(value: string) {
  const text = value.trim()
  const fromLink = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(text) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(text)
  if (fromLink) return fromLink[1]
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : null
}

export function isDriveFileId(value: string) {
  return /^[A-Za-z0-9_-]{10,128}$/.test(value)
}

// Trials compare without case, spaces or punctuation: "rustbelt" is Rust Belt.
function trialKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// "1:05.123" or "65.123" (or "65,123") in seconds, to the millisecond.
export function parseRunTime(text: string) {
  const match = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/.exec(text.trim())
  if (!match) return null
  const minutes = match[1] ? Number(match[1]) : 0
  const seconds = Number(match[2].replace(",", "."))
  if (match[1] && seconds >= 60) return null
  const time = Math.round((minutes * 60 + seconds) * 1000) / 1000
  return time > 0 && Number.isFinite(time) ? time : null
}

export type ParsedDriveName = { trial: string | null; trialText: string; time: number | null; player: string | null }

// The old Drive's names are "{lowercase trial} {time} | {player}", plus the
// file's extension. Anything that doesn't read is left null for an owner to
// fill in.
export function parseDriveFileName(fileName: string, trials: readonly string[]): ParsedDriveName {
  const name = VIDEO_EXTENSIONS.has(extensionOf(fileName)) ? fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "") : fileName
  const bar = name.indexOf("|")
  const left = (bar >= 0 ? name.slice(0, bar) : name).replace(/\s+/g, " ").trim()
  // Drive adds " (1)" to a second copy with the same name.
  const player = bar >= 0 ? name.slice(bar + 1).replace(/\s*\(\d+\)\s*$/, "").trim() || null : null

  const timed = /^(.*?)\s*((?:\d+:)?\d+(?:[.,]\d+)?)$/.exec(left)
  const trialText = (timed ? timed[1] : left).trim()
  const time = timed ? parseRunTime(timed[2]) : null
  const key = trialKey(trialText)
  const trial = key ? (trials.find((candidate) => trialKey(candidate) === key) ?? null) : null
  return { trial, trialText, time, player }
}

// Drive keeps two dates: when the file was uploaded (created), and when it
// last changed, which Drive for desktop carries over from the computer it
// synced from and so can be the older of the two. A record gets the earlier.
export function driveRecordDate(createdAt: number | null, modifiedAt: number | null) {
  const dates = [createdAt, modifiedAt].filter((value): value is number => typeof value === "number" && value > 0)
  return dates.length > 0 ? Math.min(...dates) : null
}

// Times are stored as REAL, so the same run is compared to the millisecond.
export function timeMs(time: number) {
  return Math.round(Number(time) * 1000)
}

// A folder named after a version ("Records/1.2.0/Crystal") suggests the
// version for the files in it: the deepest such folder wins.
export function versionFromFolder(folderPath: string, versions: readonly string[]) {
  const byName = new Map(versions.map((version) => [version.toLowerCase(), version]))
  const parts = folderPath.split("/").map((part) => part.trim().toLowerCase())
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const exact = byName.get(parts[index]) ?? byName.get(parts[index].replace(/^v(?=\d)/, ""))
    if (exact) return exact
  }
  return null
}
