import "server-only"
import { buildAuditLogStatement, insertAuditLog, type AuditActor } from "@/lib/server/audit"
import { gameVersionExists, listGameVersions, setSubmissionGameVersion } from "@/lib/server/repositories/game-version-repository"
import { enqueueVideoJobs } from "@/lib/server/services/video-processing-service"
import { STUCK_PROCESSING_SECONDS } from "@/lib/server/video-processing"
import { archiveRun, getWorldRecordRun } from "@/lib/server/services/wr-archive-service"
import { ApiError } from "@/lib/server/v2/http"
import { isPlayerNameTaken } from "@/lib/server/player-name-service"
import { validatePlayerName } from "@/lib/player-name"
import { generateShortId, generateUUID } from "@/lib/utils"
import {
  DEFAULT_DRIVE_FOLDER,
  driveRecordDate,
  importKey,
  isVideoFile,
  parseDriveFileName,
  timeMs,
  versionFromFolder,
  type ParsedDriveName,
} from "@/lib/wr-import"

// World records from the old WR Google Drive folder, which the site never
// tracked (see migrations/0024_wr_imports.sql):
//
//  1. Scan: every video in the folder and its subfolders becomes a
//     wr_imports row. The folder has to be shared as "anyone with the link",
//     and is read with the GOOGLE_DRIVE_API_KEY secret.
//  2. Copy: the video container downloads each file from Google Drive
//     itself, re-encodes it to an H.264 MP4 and puts it in the private
//     uploads bucket at imports/{drive file id} (a "drive" job), so it plays
//     in the queue. The file never passes through this Worker, and the
//     Drive original isn't kept. Jobs are queued a few at a time, each one
//     that finishes queuing the next (see queueDriveCopies).
//  3. Review, one at a time in /admin/site/wr-imports:
//     - Import: a new approved run with imported = 1, for a player on the
//       site or, by name, for one who never signed up: a placeholder player
//       (players.placeholder = 1) shared by every import with that name. Its file moves to
//       originals/{uuid} and goes through the video pipeline (reason
//       "import"); once processed, it's archived like any other record's.
//     - Match: the same run (trial, time to the millisecond, player) is
//       already on the site. The site's run and file stay, and the run is
//       backdated to the Drive file's date if that's earlier.
//     - Skip.
//
// An imported run is a world record in the record history, the archive and
// players' all-time record counts, and nothing else: it never counts toward
// PBs, WRs, scores, leaderboards or run lists (see VALID_SUBMISSION_SQL and
// EVER_WR_SQL). Nothing here recalculates a score.

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
const FOLDER_MIME = "application/vnd.google-apps.folder"
const MAX_FOLDERS = 500
const MAX_VIDEOS = 10_000
// D1 statements per batch while saving a scan.
const SCAN_BATCH = 50
// A claimed file that never got its run (the copy failed partway) goes back
// in the queue after this long.
const CLAIM_TIMEOUT_SECONDS = 10 * 60
// Files copying at once. Each one that finishes queues the next, so a big
// backlog never piles up on the video queue.
const MAX_COPYING = 12
// The video container's limit for a Drive file (MAX_DRIVE_BYTES in
// video-worker/src/processing.js).
const MAX_DRIVE_BYTES = 4 * 1024 * 1024 * 1024
// Waiting to be copied, or copying.
const NOT_COPIED = `status = 'pending' AND staged_at IS NULL AND copy_error IS NULL`

type DriveFile = { id: string; name: string; mimeType: string; size?: string; createdTime?: string; modifiedTime?: string }

function driveApiKey(env: CloudflareEnv) {
  const key = (env as CloudflareEnv & { GOOGLE_DRIVE_API_KEY?: string }).GOOGLE_DRIVE_API_KEY
  return key ? String(key) : null
}

export function isDriveConfigured(env: CloudflareEnv) {
  return Boolean(driveApiKey(env))
}

function requireDriveKey(env: CloudflareEnv) {
  const key = driveApiKey(env)
  if (!key) {
    throw new ApiError("Reading the Drive needs a Google API key: add it as the GOOGLE_DRIVE_API_KEY secret", 500, "internal_error")
  }
  return key
}

async function driveError(response: Response) {
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return json?.error?.message || `Google Drive answered ${response.status}`
}

function driveSeconds(value: string | undefined) {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? Math.floor(time / 1000) : null
}

async function listDriveFolder(key: string, folderId: string) {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(DRIVE_FILES_URL)
    // The id is checked to be letters, digits, - and _ (driveFolderId).
    url.searchParams.set("q", `'${folderId}' in parents and trashed = false`)
    url.searchParams.set("fields", "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)")
    url.searchParams.set("pageSize", "1000")
    url.searchParams.set("supportsAllDrives", "true")
    url.searchParams.set("includeItemsFromAllDrives", "true")
    url.searchParams.set("key", key)
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const response = await fetch(url)
    if (!response.ok) {
      throw new ApiError(`Couldn’t read the Drive folder. Google said: ${await driveError(response)}`, 502, "bad_request")
    }
    const page = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string }
    files.push(...(page.files ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return files
}

// Lists every video under the folder and records it. Files already in the
// queue keep where they are in it; one replaced in the Drive is copied again.
export async function scanDriveFolder(env: CloudflareEnv, db: D1Database, folderId: string, now: number) {
  const key = requireDriveKey(env)
  const folders = [{ id: folderId, path: "" }]
  const seen = new Set([folderId])
  const videos: Array<DriveFile & { path: string }> = []
  let ignored = 0

  for (let index = 0; index < folders.length; index += 1) {
    if (index >= MAX_FOLDERS) throw new ApiError(`The folder has more than ${MAX_FOLDERS} folders inside it`, 400, "validation_error")
    const folder = folders[index]
    for (const file of await listDriveFolder(key, folder.id)) {
      if (file.mimeType === FOLDER_MIME) {
        if (!seen.has(file.id)) {
          seen.add(file.id)
          folders.push({ id: file.id, path: folder.path ? `${folder.path}/${file.name}` : file.name })
        }
      } else if (isVideoFile(file.mimeType, file.name)) {
        videos.push({ ...file, path: folder.path })
      } else {
        ignored += 1
      }
    }
    if (videos.length > MAX_VIDEOS) throw new ApiError(`The folder has more than ${MAX_VIDEOS} videos`, 400, "validation_error")
  }

  const { results } = await db.prepare(`SELECT drive_file_id FROM wr_imports`).all<{ drive_file_id: string }>()
  const known = new Set((results || []).map((row) => row.drive_file_id))
  const statements = videos.map((file) =>
    db
      .prepare(
        `INSERT INTO wr_imports (drive_file_id, file_name, folder_path, mime_type, size, drive_created_at, drive_modified_at, scanned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (drive_file_id) DO UPDATE SET
           file_name = excluded.file_name,
           folder_path = excluded.folder_path,
           mime_type = excluded.mime_type,
           staged_at = CASE WHEN wr_imports.status = 'pending' AND wr_imports.size IS NOT excluded.size THEN NULL ELSE wr_imports.staged_at END,
           encode_queued_at = CASE WHEN wr_imports.status = 'pending' AND wr_imports.size IS NOT excluded.size THEN NULL ELSE wr_imports.encode_queued_at END,
           copy_error = CASE WHEN wr_imports.status = 'pending' AND wr_imports.size IS NOT excluded.size THEN NULL ELSE wr_imports.copy_error END,
           size = excluded.size,
           drive_created_at = excluded.drive_created_at,
           drive_modified_at = excluded.drive_modified_at,
           scanned_at = excluded.scanned_at`
      )
      .bind(
        file.id,
        file.name,
        file.path,
        file.mimeType || null,
        file.size ? Number(file.size) : null,
        driveSeconds(file.createdTime),
        driveSeconds(file.modifiedTime),
        now
      )
  )
  for (let index = 0; index < statements.length; index += SCAN_BATCH) {
    await db.batch(statements.slice(index, index + SCAN_BATCH))
  }
  await queueDriveCopies(env, db).catch((error) => console.error("Queueing Drive copies failed:", error))

  return { folders: folders.length, videos: videos.length, added: videos.filter((file) => !known.has(file.id)).length, ignored }
}

async function countWaitingCopies(db: D1Database) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM wr_imports WHERE ${NOT_COPIED}`).first<{ count: number }>()
  return Number(row?.count ?? 0)
}

// Queues copies of the next files, oldest first, up to MAX_COPYING at once.
// One queued long ago lost its job somewhere and is queued again.
// `retryFailed` puts the ones that failed back in line first.
export async function queueDriveCopies(env: CloudflareEnv, db: D1Database, options: { retryFailed?: boolean } = {}) {
  if (!env.VIDEO_QUEUE) return { queued: 0, remaining: await countWaitingCopies(db) }
  const now = Math.floor(Date.now() / 1000)
  const stale = now - STUCK_PROCESSING_SECONDS
  if (options.retryFailed) {
    await db
      .prepare(`UPDATE wr_imports SET copy_error = NULL, encode_queued_at = NULL WHERE status = 'pending' AND staged_at IS NULL AND copy_error IS NOT NULL`)
      .run()
  }
  await db
    .prepare(`UPDATE wr_imports SET copy_error = ? WHERE ${NOT_COPIED} AND size > ?`)
    .bind(`It’s over ${MAX_DRIVE_BYTES / 1024 ** 3} GB, too big to copy`, MAX_DRIVE_BYTES)
    .run()

  const busy = await db
    .prepare(`SELECT COUNT(*) AS count FROM wr_imports WHERE ${NOT_COPIED} AND encode_queued_at >= ?`)
    .bind(stale)
    .first<{ count: number }>()
  const room = MAX_COPYING - Number(busy?.count ?? 0)
  let ids: string[] = []
  if (room > 0) {
    const { results } = await db
      .prepare(
        `SELECT drive_file_id FROM wr_imports
         WHERE ${NOT_COPIED} AND (encode_queued_at IS NULL OR encode_queued_at < ?)
         ORDER BY drive_created_at ASC
         LIMIT ?`
      )
      .bind(stale, room)
      .all<{ drive_file_id: string }>()
    ids = (results || []).map((row) => row.drive_file_id)
  }
  if (ids.length > 0) {
    await enqueueVideoJobs(env, ids.map((driveFileId) => ({ driveFileId, reason: "drive" as const, attempt: 1 as const })))
    await db.batch(ids.map((id) => db.prepare(`UPDATE wr_imports SET encode_queued_at = ? WHERE drive_file_id = ?`).bind(now, id)))
  }
  return { queued: ids.length, remaining: await countWaitingCopies(db) }
}

// The video container's result for a "drive" job (see
// /v2/internal/wr-imports/[id]). A file handled while it was copying
// doesn't need the copy.
export async function applyDriveCopyResult(env: CloudflareEnv, db: D1Database, driveFileId: string, payload: { status?: unknown; error?: unknown }) {
  if (payload.status !== "ready" && payload.status !== "failed") {
    throw new ApiError("Invalid result", 400, "validation_error")
  }
  const row = await db
    .prepare(`SELECT status, staged_at FROM wr_imports WHERE drive_file_id = ?`)
    .bind(driveFileId)
    .first<{ status: ImportRowDb["status"]; staged_at: number | null }>()
  if (!row || row.status !== "pending") {
    if (row?.status !== "imported") await env.UPLOADS?.delete(importKey(driveFileId))
    return { applied: false }
  }
  if (row.staged_at !== null) return { applied: false }

  const now = Math.floor(Date.now() / 1000)
  if (payload.status === "ready") {
    await db
      .prepare(`UPDATE wr_imports SET staged_at = ?, mime_type = 'video/mp4', encode_queued_at = NULL, copy_error = NULL WHERE drive_file_id = ?`)
      .bind(now, driveFileId)
      .run()
  } else {
    const message = String(payload.error || "The video couldn’t be processed.")
    await db.prepare(`UPDATE wr_imports SET copy_error = ?, encode_queued_at = NULL WHERE drive_file_id = ?`).bind(message.slice(0, 300), driveFileId).run()
  }
  return { applied: true }
}

export type ImportPlayer = {
  uuid: string
  player_name: string
  score: number
  // 1 for a player with no account, just a name.
  placeholder: number
  discord_id: string | null
  discord_avatar: string | null
  discord_discriminator: string | null
  has_roblox_avatar: number | null
}

export type ImportMatch = {
  uuid: string
  player_uuid: string
  player_name: string
  player_score: number
  date: number
  game_version: string | null
  imported: boolean
}

type ImportRowDb = {
  drive_file_id: string
  file_name: string
  folder_path: string
  mime_type: string | null
  size: number | null
  drive_created_at: number | null
  drive_modified_at: number | null
  staged_at: number | null
  encode_queued_at: number | null
  copy_error: string | null
  status: "pending" | "imported" | "merged" | "skipped"
  submission_uuid: string | null
  resolved_at: number | null
}

export type ImportQueueRow = Omit<ImportRowDb, "mime_type" | "staged_at" | "encode_queued_at" | "resolved_at"> & {
  // Copied and re-encoded, ready to watch and import.
  staged: boolean
  // Being downloaded and re-encoded by the video container.
  copying: boolean
  date: number | null
  parsed: ParsedDriveName
  version: string | null
  players: ImportPlayer[]
  matches: ImportMatch[]
}

const PLAYER_FIELDS = `p.uuid, p.player_name, p.score, p.placeholder, p.discord_id, p.discord_avatar, p.discord_discriminator,
  (p.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar`

// Every active player whose site name, or linked Roblox username or display
// name, is one of `names` (lowercased), by name.
async function playersNamed(db: D1Database, names: readonly string[]) {
  const found = new Map<string, Map<string, ImportPlayer>>()
  // Each name is bound three times; D1 takes 100 parameters per statement.
  for (let index = 0; index < names.length; index += 30) {
    const chunk = names.slice(index, index + 30)
    const list = chunk.map(() => "?").join(",")
    const { results } = await db
      .prepare(
        `SELECT ${PLAYER_FIELDS}, LOWER(p.player_name) AS matched
         FROM players p
         WHERE COALESCE(p.account_status, 'active') = 'active' AND LOWER(p.player_name) IN (${list})
         UNION
         SELECT ${PLAYER_FIELDS}, LOWER(o.username) AS matched
         FROM oauth_accounts o JOIN players p ON p.uuid = o.player_uuid
         WHERE o.provider = 'roblox' AND COALESCE(p.account_status, 'active') = 'active' AND LOWER(o.username) IN (${list})
         UNION
         SELECT ${PLAYER_FIELDS}, LOWER(o.display_name) AS matched
         FROM oauth_accounts o JOIN players p ON p.uuid = o.player_uuid
         WHERE o.provider = 'roblox' AND COALESCE(p.account_status, 'active') = 'active' AND LOWER(o.display_name) IN (${list})`
      )
      .bind(...chunk, ...chunk, ...chunk)
      .all<ImportPlayer & { matched: string }>()
    for (const { matched, ...player } of results || []) {
      const byUuid = found.get(matched) ?? new Map<string, ImportPlayer>()
      byUuid.set(player.uuid, { ...player, score: Number(player.score) })
      found.set(matched, byUuid)
    }
  }
  return found
}

type MatchRow = ImportMatch & { trial_name: string; ms: number; imported: boolean | number }

const MATCH_SELECT = `SELECT s.uuid, s.trial_name, CAST(ROUND(s.time * 1000) AS INTEGER) AS ms, s.player_uuid,
    COALESCE(p.player_name, s.player_name) AS player_name, COALESCE(p.score, 0) AS player_score, s.date, s.game_version, s.imported
  FROM submissions s
  LEFT JOIN players p ON p.uuid = s.player_uuid`

function toMatch(row: MatchRow): ImportMatch {
  return {
    uuid: row.uuid,
    player_uuid: row.player_uuid,
    player_name: row.player_name,
    player_score: Number(row.player_score),
    date: Number(row.date),
    game_version: row.game_version,
    imported: Boolean(row.imported),
  }
}

// Approved runs, on the site or imported earlier, at these trials and times.
async function runsAt(db: D1Database, pairs: ReadonlyArray<[trial: string, ms: number]>) {
  const found = new Map<string, ImportMatch[]>()
  for (let index = 0; index < pairs.length; index += 45) {
    const chunk = pairs.slice(index, index + 45)
    const { results } = await db
      .prepare(
        `${MATCH_SELECT}
         WHERE s.state = 'approved'
           AND (s.trial_name, CAST(ROUND(s.time * 1000) AS INTEGER)) IN (VALUES ${chunk.map(() => "(?, ?)").join(", ")})
         ORDER BY s.date ASC`
      )
      .bind(...chunk.flat())
      .all<MatchRow>()
    for (const row of results || []) {
      const key = `${row.trial_name}\u0000${row.ms}`
      found.set(key, [...(found.get(key) ?? []), toMatch(row)])
    }
  }
  return found
}

// The same run on the site, if there is one: same trial, same time to the
// millisecond, same player.
async function findSameRun(db: D1Database, trial: string, time: number, playerUuid: string) {
  const row = await db
    .prepare(
      `${MATCH_SELECT}
       WHERE s.state = 'approved' AND s.trial_name = ? AND CAST(ROUND(s.time * 1000) AS INTEGER) = ? AND s.player_uuid = ?
       ORDER BY s.date ASC
       LIMIT 1`
    )
    .bind(trial, timeMs(time), playerUuid)
    .first<MatchRow>()
  return row ? toMatch(row) : null
}

// Everything the queue page shows. A file whose run was deleted goes back in
// the queue (its copy went with the run, so it's copied again).
export async function listImportQueue(env: CloudflareEnv, db: D1Database) {
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `UPDATE wr_imports SET status = 'pending', staged_at = NULL, encode_queued_at = NULL, copy_error = NULL, resolved_at = NULL, resolved_by = NULL
       WHERE status IN ('imported', 'merged') AND submission_uuid IS NULL AND COALESCE(resolved_at, 0) < ?`
    )
    .bind(now - CLAIM_TIMEOUT_SECONDS)
    .run()
  // Picks up anything the chain of copies dropped.
  await queueDriveCopies(env, db).catch((error) => console.error("Queueing Drive copies failed:", error))

  const [{ results: rows }, { results: trialRows }, versions] = await Promise.all([
    db.prepare(`SELECT * FROM wr_imports`).all<ImportRowDb>(),
    db.prepare(`SELECT name FROM trials ORDER BY sort_order ASC, name ASC`).all<{ name: string }>(),
    listGameVersions(db),
  ])
  const trials = (trialRows || []).map((row) => row.name)
  const versionNames = versions.map((version) => version.name)

  const parsed = (rows || []).map((row) => ({ row, parsed: parseDriveFileName(row.file_name, trials) }))
  const pending = parsed.filter(({ row }) => row.status === "pending")
  const names = [...new Set(pending.flatMap(({ parsed: name }) => (name.player ? [name.player.toLowerCase()] : [])))]
  const pairs = new Map<string, [string, number]>()
  for (const { parsed: name } of pending) {
    if (name.trial && name.time !== null) pairs.set(`${name.trial}\u0000${timeMs(name.time)}`, [name.trial, timeMs(name.time)])
  }
  const [players, matches] = await Promise.all([playersNamed(db, names), runsAt(db, [...pairs.values()])])

  const imports: ImportQueueRow[] = parsed
    .map(({ row, parsed: name }) => {
      const open = row.status === "pending"
      return {
        drive_file_id: row.drive_file_id,
        file_name: row.file_name,
        folder_path: row.folder_path,
        size: row.size === null ? null : Number(row.size),
        drive_created_at: row.drive_created_at,
        drive_modified_at: row.drive_modified_at,
        copy_error: row.copy_error,
        status: row.status,
        submission_uuid: row.submission_uuid,
        staged: row.staged_at !== null,
        copying: row.staged_at === null && row.encode_queued_at !== null && !row.copy_error,
        date: driveRecordDate(row.drive_created_at, row.drive_modified_at),
        parsed: name,
        version: versionFromFolder(row.folder_path, versionNames),
        players: open && name.player ? [...(players.get(name.player.toLowerCase())?.values() ?? [])] : [],
        matches: open && name.trial && name.time !== null ? (matches.get(`${name.trial}\u0000${timeMs(name.time)}`) ?? []) : [],
      }
    })
    .sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.file_name.localeCompare(b.file_name))

  return { configured: isDriveConfigured(env), default_folder: DEFAULT_DRIVE_FOLDER, trials, versions, imports, waiting_copies: await countWaitingCopies(db) }
}

async function getImportRow(db: D1Database, driveFileId: string) {
  const row = await db.prepare(`SELECT * FROM wr_imports WHERE drive_file_id = ?`).bind(driveFileId).first<ImportRowDb>()
  if (!row) throw new ApiError("That file isn’t in the import queue", 404, "not_found")
  return row
}

// Takes a file out of the queue for one owner, so two saving it at once
// can't both import it.
async function claim(db: D1Database, driveFileId: string, status: "imported" | "merged" | "skipped", actor: AuditActor, now: number) {
  const outcome = await db
    .prepare(`UPDATE wr_imports SET status = ?, resolved_at = ?, resolved_by = ? WHERE drive_file_id = ? AND status = 'pending'`)
    .bind(status, now, actor.player_name, driveFileId)
    .run()
  if (outcome.meta.changes !== 1) throw new ApiError("Someone already handled this file. Reload the queue.", 409, "conflict")
}

async function release(db: D1Database, driveFileId: string) {
  await db
    .prepare(`UPDATE wr_imports SET status = 'pending', resolved_at = NULL, resolved_by = NULL, submission_uuid = NULL WHERE drive_file_id = ?`)
    .bind(driveFileId)
    .run()
}

export type ImportInput = { trial: string; time: number; player_uuid: string; player_name: string; version: string; date: number }

type CheckedPlayer = { uuid: string; player_name: string; create: boolean }

// The player an owner picked (player_uuid), or a name for one with no
// account (player_name): the placeholder with that name, or a new one to
// create with the run. A name an account already has is refused, since
// that's almost always the same person.
async function checkPlayer(db: D1Database, input: Partial<Record<keyof ImportInput, unknown>>): Promise<CheckedPlayer> {
  if (typeof input.player_uuid === "string" && input.player_uuid) {
    const player = await db
      .prepare(`SELECT uuid, player_name FROM players WHERE uuid = ? AND COALESCE(account_status, 'active') = 'active'`)
      .bind(input.player_uuid)
      .first<{ uuid: string; player_name: string }>()
    if (!player) throw new ApiError("Pick the player who set it", 400, "validation_error")
    return { ...player, create: false }
  }
  if (typeof input.player_name !== "string") throw new ApiError("Pick the player who set it", 400, "validation_error")
  const name = validatePlayerName(input.player_name)
  if (!name.ok) throw new ApiError(name.message, 400, "validation_error")
  const placeholder = await db
    .prepare(`SELECT uuid, player_name FROM players WHERE placeholder = 1 AND LOWER(player_name) = LOWER(?)`)
    .bind(name.playerName)
    .first<{ uuid: string; player_name: string }>()
  if (placeholder) return { ...placeholder, create: false }
  if (await isPlayerNameTaken(db, name.playerName)) {
    throw new ApiError(`“${name.playerName}” has an account on the site. Pick them instead.`, 400, "validation_error")
  }
  return { uuid: generateUUID(), player_name: name.playerName, create: true }
}

// What an owner sent, checked: a trial the site has, a time, a player, a
// version on the list and a date that's already happened.
async function checkInput(db: D1Database, input: Partial<Record<keyof ImportInput, unknown>>, now: number) {
  const time = typeof input.time === "number" && Number.isFinite(input.time) ? Math.round(input.time * 1000) / 1000 : NaN
  if (!(time > 0 && time < 100_000)) throw new ApiError("Enter the run’s time", 400, "validation_error")
  const date = typeof input.date === "number" && Number.isInteger(input.date) ? input.date : NaN
  if (!(date > Date.UTC(2000, 0, 1) / 1000 && date <= now + 86400)) throw new ApiError("Enter the date the record was set", 400, "validation_error")
  const trial = typeof input.trial === "string" ? await db.prepare(`SELECT name, version FROM trials WHERE name = ?`).bind(input.trial).first<{ name: string; version: number }>() : null
  if (!trial) throw new ApiError("Pick a trial the site has", 400, "validation_error")
  const player = await checkPlayer(db, input)
  const version = typeof input.version === "string" ? input.version : ""
  if (!(await gameVersionExists(db, version))) throw new ApiError("Pick a version from the list", 400, "validation_error")
  return { time, date, trial, player, version }
}

async function moveObject(bucket: R2Bucket, from: string, to: string, customMetadata: Record<string, string>) {
  const object = await bucket.get(from)
  if (!object) return null
  const { readable, writable } = new FixedLengthStream(object.size)
  const piping = object.body.pipeTo(writable)
  await bucket.put(to, readable, { httpMetadata: object.httpMetadata, customMetadata })
  await piping
  await bucket.delete(from)
  return object.size
}

// A new run for the file. Refused (409, with the run in `details.match`)
// when the same run is already on the site: that one is matched instead.
export async function importDriveFile(env: CloudflareEnv, db: D1Database, actor: AuditActor, driveFileId: string, body: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000)
  const row = await getImportRow(db, driveFileId)
  if (row.status !== "pending") throw new ApiError("Someone already handled this file. Reload the queue.", 409, "conflict")
  if (row.staged_at === null) throw new ApiError("This file hasn’t been copied from the Drive and re-encoded yet", 409, "conflict")
  const { time, date, trial, player, version } = await checkInput(db, body, now)

  const match = player.create ? null : await findSameRun(db, trial.name, time, player.uuid)
  if (match) throw new ApiError("This run is already on the site", 409, "conflict", { match })

  await claim(db, driveFileId, "imported", actor, now)
  const uuid = generateShortId()
  const originalKey = `originals/${uuid}`
  let size: number | null
  try {
    size = await moveObject(env.UPLOADS, importKey(driveFileId), originalKey, { submission_uuid: uuid, source: "import" })
  } catch (error) {
    await release(db, driveFileId)
    throw error
  }
  if (size === null) {
    await release(db, driveFileId)
    await db.prepare(`UPDATE wr_imports SET staged_at = NULL, encode_queued_at = NULL WHERE drive_file_id = ?`).bind(driveFileId).run()
    throw new ApiError("The copied file is gone, so it’s being copied from the Drive again. Try again in a minute.", 409, "conflict")
  }

  const note = `Imported from the old WR Drive: ${[row.folder_path, row.file_name].filter(Boolean).join("/")}`
  const createPlayer = player.create
    ? [
        db
          .prepare(
            `INSERT INTO players (uuid, player_id, player_name, date_joined, permission, account_status, auth_provider, placeholder)
             VALUES (?, ?, ?, ?, 0, 'active', 'discord', 1)`
          )
          // player_id is never an account id for a placeholder, so no
          // login can land on it (see findPlayerByIdentity).
          .bind(player.uuid, player.uuid, player.player_name, now),
      ]
    : []
  try {
    await db.batch([
      ...createPlayer,
      db
        .prepare(
          `INSERT INTO submissions (
             uuid, player_uuid, trial_name, player_name, time, date, trial_version, state, moderator_note, moderator_username,
             game_version, reviewed_at, imported, video_status, video_source_type, video_source_ref, video_updated_at,
             original_key, original_size, original_source
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, 1, 'processing', 'import', ?, ?, ?, ?, 'original')`
        )
        .bind(uuid, player.uuid, trial.name, player.player_name, time, date, trial.version, note.slice(0, 500), actor.player_name, version, now, originalKey, now, originalKey, size),
      db.prepare(`UPDATE wr_imports SET submission_uuid = ?, staged_at = NULL, copy_error = NULL WHERE drive_file_id = ?`).bind(uuid, driveFileId),
      buildAuditLogStatement(db, "wr_imported", "submission", uuid, {
        actor,
        details: {
          trial_name: trial.name,
          time,
          player_name: player.player_name,
          ...(player.create ? { new_placeholder: true } : {}),
          date,
          game_version: version,
          file_name: row.file_name,
          drive_file_id: driveFileId,
        },
      }),
    ])
  } catch (error) {
    // Put the file back where the queue expects it.
    await moveObject(env.UPLOADS, originalKey, importKey(driveFileId), { drive_file_id: driveFileId }).catch(() => null)
    await release(db, driveFileId)
    throw error
  }

  try {
    await enqueueVideoJobs(env, [{ submissionUuid: uuid, reason: "import", attempt: 1 }])
  } catch (error) {
    // The daily sweep re-queues runs stuck in processing.
    console.error(`Queueing the imported record ${uuid} failed:`, error)
  }
  // A new placeholder, for the queue to offer on the other files with its name.
  const created: ImportPlayer | null = player.create
    ? { uuid: player.uuid, player_name: player.player_name, score: 0, placeholder: 1, discord_id: null, discord_avatar: null, discord_discriminator: null, has_roblox_avatar: 0 }
    : null
  return { status: "imported" as const, submission_uuid: uuid, player: created }
}

// The file is a run the site already has: that run and its file stay, and
// it's backdated to the file's date if that's earlier. The version picked
// in the queue is set on it too.
export async function matchDriveFile(env: CloudflareEnv, db: D1Database, actor: AuditActor, driveFileId: string, body: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000)
  const row = await getImportRow(db, driveFileId)
  if (row.status !== "pending") throw new ApiError("Someone already handled this file. Reload the queue.", 409, "conflict")
  const { time, date, trial, player, version } = await checkInput(db, body, now)
  const target = typeof body.submission_uuid === "string" ? body.submission_uuid : ""
  const match = await findSameRun(db, trial.name, time, player.uuid)
  if (!match || match.uuid !== target) {
    throw new ApiError("That run on the site doesn’t match this file’s trial, time and player any more. Reload the queue.", 409, "conflict")
  }

  await claim(db, driveFileId, "merged", actor, now)
  const backdate = date < match.date
  const statements: D1PreparedStatement[] = []
  if (backdate) {
    statements.push(
      db.prepare(`UPDATE submissions SET date = ? WHERE uuid = ?`).bind(date, match.uuid),
      db.prepare(`UPDATE wrs SET date = ? WHERE submission_uuid = ?`).bind(date, match.uuid),
      db.prepare(`UPDATE pbs SET date = ? WHERE submission_uuid = ?`).bind(date, match.uuid)
    )
  }
  statements.push(
    db.prepare(`UPDATE wr_imports SET submission_uuid = ?, staged_at = NULL, encode_queued_at = NULL WHERE drive_file_id = ?`).bind(match.uuid, driveFileId),
    buildAuditLogStatement(db, "wr_import_matched", "submission", match.uuid, {
      actor,
      details: {
        trial_name: trial.name,
        time,
        player_name: match.player_name,
        file_name: row.file_name,
        drive_file_id: driveFileId,
        ...(backdate ? { old_date: match.date, new_date: date } : {}),
      },
    })
  )
  try {
    await db.batch(statements)
  } catch (error) {
    await release(db, driveFileId)
    throw error
  }

  if (match.game_version !== version) {
    await setSubmissionGameVersion(db, match.uuid, version)
    await insertAuditLog(db, "submission_version_changed", "submission", match.uuid, {
      actor,
      details: { trial_name: trial.name, time, old_version: match.game_version, new_version: version },
    })
  }

  // The site keeps its own file, so the copy goes. A new version (or date)
  // can change the run's archive name, or put it in the archive at all.
  await env.UPLOADS.delete(importKey(driveFileId))
  const record = env.SUBMISSION_VIDEOS ? await getWorldRecordRun(db, match.uuid) : null
  if (record) {
    try {
      await archiveRun(env, db, record)
    } catch (error) {
      console.error(`Archiving ${match.uuid} failed:`, error)
    }
  }
  return { status: "merged" as const, submission_uuid: match.uuid, backdated: backdate }
}

export async function skipDriveFile(env: CloudflareEnv, db: D1Database, actor: AuditActor, driveFileId: string) {
  const now = Math.floor(Date.now() / 1000)
  const row = await getImportRow(db, driveFileId)
  await claim(db, driveFileId, "skipped", actor, now)
  await db.batch([
    db.prepare(`UPDATE wr_imports SET staged_at = NULL, encode_queued_at = NULL WHERE drive_file_id = ?`).bind(driveFileId),
    buildAuditLogStatement(db, "wr_import_skipped", "wr_import", driveFileId, { actor, details: { file_name: row.file_name } }),
  ])
  await env.UPLOADS.delete(importKey(driveFileId))
  return { status: "skipped" as const }
}

// Back in the queue. Its copy was deleted when it was skipped, so it's
// copied again first.
export async function restoreDriveFile(db: D1Database, driveFileId: string) {
  await getImportRow(db, driveFileId)
  const outcome = await db
    .prepare(`UPDATE wr_imports SET status = 'pending', resolved_at = NULL, resolved_by = NULL WHERE drive_file_id = ? AND status = 'skipped'`)
    .bind(driveFileId)
    .run()
  if (outcome.meta.changes !== 1) throw new ApiError("Only a skipped file can go back in the queue", 409, "conflict")
  return { status: "pending" as const }
}
