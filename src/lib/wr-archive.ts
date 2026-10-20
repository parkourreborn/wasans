// The world record archive's rules: what an archived original is called
// and what a game version may be named. No DB, no "server-only", so the
// server, the pages and the tests share it.
//
// Every run that was ever a world record keeps its original for good, at
//   world-records/{trial}/{player name} ({player uuid}) {time} ({version})
// in the private wasans-uploads bucket, served publicly through /archive.
// A run can't hold two places in a trial's record chain with the same time,
// so with the player's uuid in it the name never collides.

export const ARCHIVE_PREFIX = "world-records/"
export const NO_VERSION = "no version"

// Every other run's original is deleted this long after it's reviewed.
export const ORIGINAL_KEEP_SECONDS = 7 * 24 * 60 * 60

const MAX_VERSION_LENGTH = 32
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/

// A version name as an owner typed it, tidied, or null if it can't be one:
// up to 32 letters, digits, spaces, dots, dashes, underscores and pluses.
export function normalizeVersionName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().replace(/\s+/g, " ")
  return name.length <= MAX_VERSION_LENGTH && VERSION_PATTERN.test(name) ? name : null
}

// Highest version first, comparing numbers as numbers (1.10 above 1.9),
// and a release above its own pre-releases (1.3.0 above 1.3.0-beta).
export function compareVersionsDesc(a: string, b: string) {
  const [aBase, ...aRest] = a.split("-")
  const [bBase, ...bRest] = b.split("-")
  const byBase = bBase.localeCompare(aBase, undefined, { numeric: true, sensitivity: "base" })
  if (byBase !== 0) return byBase
  const aSuffix = aRest.join("-")
  const bSuffix = bRest.join("-")
  if (!aSuffix || !bSuffix) return Number(Boolean(aSuffix)) - Number(Boolean(bSuffix))
  return bSuffix.localeCompare(aSuffix, undefined, { numeric: true, sensitivity: "base" })
}

// A slash would start a folder, and control characters don't belong in a
// file name.
function namePart(value: string) {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "-").replace(/\s+/g, " ").trim() || "-"
}

export type ArchiveRun = {
  trial_name: string
  player_name: string
  player_uuid: string
  time: number
  game_version: string | null
}

export function archiveFileName(run: ArchiveRun) {
  const version = run.game_version ? namePart(run.game_version) : NO_VERSION
  return `${namePart(run.player_name)} (${namePart(run.player_uuid)}) ${Number(run.time).toFixed(3)} (${version})`
}

export function archiveKey(run: ArchiveRun) {
  return `${ARCHIVE_PREFIX}${namePart(run.trial_name)}/${archiveFileName(run)}`
}

export function isArchiveKey(key: string | null | undefined): key is string {
  return typeof key === "string" && key.startsWith(ARCHIVE_PREFIX)
}

// Every private file a run can have, to delete along with it: its original,
// and wherever that was archived.
export function runOriginalKeys(uuid: string, originalKey: string | null | undefined) {
  return [...new Set([`originals/${uuid}`, originalKey])].filter((key): key is string => Boolean(key))
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/x-m4v": "m4v",
  "video/3gpp": "3gp",
  "video/mpeg": "mpg",
  "video/x-flv": "flv",
}

// What a download is saved as: the archive name, plus an extension when the
// file's type gives one (some uploads only ever said octet-stream).
export function archiveDownloadName(fileName: string, contentType: string | null | undefined) {
  const extension = contentType ? EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()] : undefined
  return extension ? `${fileName}.${extension}` : fileName
}
