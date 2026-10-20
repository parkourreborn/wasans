import "server-only"
import type { ArchiveEntry } from "@/lib/archive-filters"
import { attachmentDisposition } from "@/lib/server/r2-presign"
import {
  ORIGINAL_KEEP_SECONDS,
  archiveDownloadName,
  archiveFileName,
  archiveKey,
  isArchiveKey,
  runOriginalKeys,
  type ArchiveRun,
} from "@/lib/wr-archive"

// What happens to a run's private original (see lib/wr-archive.ts):
//  - Every run that was ever a world record keeps it for good, moved to its
//    archive name in world-records/. If its original is already gone, the
//    published video is copied in instead.
//  - Every other run's is deleted 7 days after the run is reviewed. Pending
//    runs keep theirs.
// Both happen in the daily maintenance sweep. The bucket's 90-day lifecycle
// rule on originals/ stays as a safety net for anything left behind, such as
// a video that failed processing; it can't reach world-records/.

// The same "was ever the record" chain as getWorldRecordHistoryAll.
const EVER_WR_SQL = `s.state = 'approved' AND NOT EXISTS (
  SELECT 1
  FROM submissions earlier
  WHERE earlier.trial_name = s.trial_name
    AND earlier.state = 'approved'
    AND (earlier.date < s.date OR (earlier.date = s.date AND earlier.uuid < s.uuid))
    AND earlier.time <= s.time
)`

export type OriginalSource = "original" | "published"

export type WorldRecordRun = ArchiveRun & {
  uuid: string
  date: number
  original_key: string | null
  original_size: number | null
  original_source: OriginalSource | null
  is_current_wr: number
}

const WORLD_RECORD_RUN_SELECT = `SELECT
    s.uuid, s.trial_name, s.player_uuid, COALESCE(p.player_name, s.player_name) AS player_name,
    s.time, s.date, s.game_version, s.original_key, s.original_size, s.original_source,
    (w.submission_uuid IS NOT NULL) AS is_current_wr
  FROM submissions s
  LEFT JOIN players p ON p.uuid = s.player_uuid
  LEFT JOIN wrs w ON w.submission_uuid = s.uuid`

// Newest record first.
export async function listWorldRecordRuns(db: D1Database) {
  const { results } = await db
    .prepare(`${WORLD_RECORD_RUN_SELECT} WHERE ${EVER_WR_SQL} ORDER BY s.date DESC, s.uuid DESC`)
    .all<WorldRecordRun>()
  return results || []
}

// The run, if it was ever a world record.
export async function getWorldRecordRun(db: D1Database, uuid: string) {
  return db.prepare(`${WORLD_RECORD_RUN_SELECT} WHERE s.uuid = ? AND ${EVER_WR_SQL}`).bind(uuid).first<WorldRecordRun>()
}

export function isArchived(run: WorldRecordRun) {
  return run.original_key === archiveKey(run)
}

export type ArchiveOutcome = "archived" | "unchanged" | "missing"

// Puts a world record's original at its archive name: after it becomes a
// WR, when its version is set or changed, or when its player is renamed.
// The file can be in one of several places, tried in order: already at the
// name (an earlier attempt that didn't get recorded), where it was last
// archived, the private original, and last the published video.
export async function archiveRun(env: CloudflareEnv, db: D1Database, run: WorldRecordRun): Promise<ArchiveOutcome> {
  const key = archiveKey(run)
  if (run.original_key === key) return "unchanged"
  const uploads = env.UPLOADS

  const existing = await uploads.head(key)
  if (existing) {
    await recordArchive(db, run.uuid, key, existing.size, sourceOf(existing.customMetadata?.source))
    await deleteLeftovers(uploads, run, key)
    return "archived"
  }

  const candidates: Array<{ bucket: R2Bucket; key: string; source: OriginalSource }> = []
  if (run.original_key && run.original_key !== key) {
    candidates.push({ bucket: uploads, key: run.original_key, source: run.original_source ?? "original" })
  }
  if (run.original_key !== `originals/${run.uuid}`) {
    candidates.push({ bucket: uploads, key: `originals/${run.uuid}`, source: "original" })
  }
  candidates.push({ bucket: env.SUBMISSION_VIDEOS, key: `scores/${run.uuid}.mp4`, source: "published" })

  for (const candidate of candidates) {
    const object = await candidate.bucket.get(candidate.key)
    if (!object) continue

    const contentType = object.httpMetadata?.contentType ?? (candidate.source === "published" ? "video/mp4" : undefined)
    const { readable, writable } = new FixedLengthStream(object.size)
    const piping = object.body.pipeTo(writable)
    await uploads.put(key, readable, {
      httpMetadata: {
        ...(contentType ? { contentType } : {}),
        contentDisposition: attachmentDisposition(archiveDownloadName(archiveFileName(run), contentType)),
      },
      customMetadata: { submission_uuid: run.uuid, source: candidate.source },
    })
    await piping

    await recordArchive(db, run.uuid, key, object.size, candidate.source)
    // The published video stays where it is; private copies elsewhere go.
    await deleteLeftovers(uploads, run, key)
    return "archived"
  }

  return "missing"
}

function sourceOf(value: string | undefined): OriginalSource {
  return value === "published" ? "published" : "original"
}

async function deleteLeftovers(uploads: R2Bucket, run: WorldRecordRun, key: string) {
  const leftovers = runOriginalKeys(run.uuid, run.original_key).filter((other) => other !== key)
  if (leftovers.length > 0) await uploads.delete(leftovers)
}

async function recordArchive(db: D1Database, uuid: string, key: string, size: number, source: OriginalSource) {
  await db
    .prepare(`UPDATE submissions SET original_key = ?, original_size = ?, original_source = ? WHERE uuid = ?`)
    .bind(key, size, source, uuid)
    .run()
}

// The ones still in originals/ first, since the safety-net rule there would
// eventually delete them; then the ones the published video stands in for;
// then renames.
function archivePriority(run: WorldRecordRun) {
  if (run.original_key?.startsWith("originals/")) return 0
  return run.original_key === null ? 1 : 2
}

// Archives the world records whose file isn't at its name yet, oldest
// first, until `limit` are done or `budgetMs` has passed. A run with no
// file anywhere doesn't count toward the limit, so a few of those can't
// hold the rest up.
export async function archiveWorldRecords(env: CloudflareEnv, db: D1Database, options: { limit: number; budgetMs: number }) {
  const started = Date.now()
  const waiting = (await listWorldRecordRuns(db))
    .filter((run) => !isArchived(run))
    .sort((a, b) => archivePriority(a) - archivePriority(b) || a.date - b.date)

  let archived = 0
  let missing = 0
  for (const run of waiting) {
    if (archived >= options.limit || Date.now() - started > options.budgetMs) break
    try {
      const outcome = await archiveRun(env, db, run)
      if (outcome === "archived") archived += 1
      if (outcome === "missing") missing += 1
    } catch (error) {
      console.error(`Archiving ${run.uuid} failed:`, error)
    }
  }
  return { archived, missing, remaining: waiting.length - archived }
}

// D1 takes at most 100 bound parameters per statement.
const UUIDS_PER_STATEMENT = 90

// Deletes the originals of runs reviewed more than 7 days ago that were
// never a world record. R2 deletes up to 1000 keys per call, so that's a
// day's batch; the next sweep picks up the rest.
export async function expireReviewedOriginals(env: CloudflareEnv, db: D1Database, now: number) {
  const { results } = await db
    .prepare(
      `SELECT s.uuid, s.original_key
       FROM submissions s
       WHERE s.original_key LIKE 'originals/%'
         AND s.state IN ('approved', 'denied')
         AND COALESCE(s.reviewed_at, s.date) < ?
         AND NOT (${EVER_WR_SQL})
       LIMIT 1000`
    )
    .bind(now - ORIGINAL_KEEP_SECONDS)
    .all<{ uuid: string; original_key: string }>()
  const rows = results || []
  if (rows.length === 0) return 0

  await env.UPLOADS.delete(rows.map((row) => row.original_key))
  const statements: D1PreparedStatement[] = []
  for (let index = 0; index < rows.length; index += UUIDS_PER_STATEMENT) {
    const uuids = rows.slice(index, index + UUIDS_PER_STATEMENT).map((row) => row.uuid)
    statements.push(
      db
        .prepare(
          `UPDATE submissions SET original_key = NULL, original_size = NULL, original_source = NULL
           WHERE original_key LIKE 'originals/%' AND uuid IN (${uuids.map(() => "?").join(",")})`
        )
        .bind(...uuids)
    )
  }
  await db.batch(statements)
  return rows.length
}

// The daily sweep (see /v2/admin/maintenance/cleanup-expired). Archiving
// streams whole videos, so it's capped well inside the cron's time.
export async function sweepOriginals(env: CloudflareEnv, db: D1Database) {
  if (!env.UPLOADS || !env.SUBMISSION_VIDEOS) {
    return { originalsDeleted: 0, recordsArchived: 0, recordsMissing: 0 }
  }
  const originalsDeleted = await expireReviewedOriginals(env, db, Math.floor(Date.now() / 1000))
  const archive = await archiveWorldRecords(env, db, { limit: 25, budgetMs: 5 * 60 * 1000 })
  return { originalsDeleted, recordsArchived: archive.archived, recordsMissing: archive.missing }
}

// The public archive: every world record whose file is archived.
export async function listArchive(db: D1Database): Promise<ArchiveEntry[]> {
  return (await listWorldRecordRuns(db))
    .filter((run) => isArchiveKey(run.original_key))
    .map((run) => ({
      submission_uuid: run.uuid,
      trial_name: run.trial_name,
      player_uuid: run.player_uuid,
      player_name: run.player_name,
      time: Number(run.time),
      date: Number(run.date),
      game_version: run.game_version,
      file_name: (run.original_key as string).slice((run.original_key as string).lastIndexOf("/") + 1),
      size: run.original_size === null ? null : Number(run.original_size),
      source: run.original_source ?? "original",
      current: Boolean(run.is_current_wr),
    }))
}
