import "server-only"
import {
  BACKFILL_CLAIM_TIMEOUT_SECONDS,
  STUCK_PROCESSING_SECONDS,
  UPLOAD_CONSUME_WINDOW_SECONDS,
} from "@/lib/server/video-processing"

export type VideoUploadRow = {
  id: string
  player_uuid: string
  object_key: string
  content_type: string
  size_bytes: number
  created_at: number
  consumed_at: number | null
  submission_uuid: string | null
}

export async function insertVideoUpload(
  db: D1Database,
  row: { id: string; playerUuid: string; objectKey: string; contentType: string; sizeBytes: number; now: number }
) {
  await db.prepare(
    `INSERT INTO video_uploads (id, player_uuid, object_key, content_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.playerUuid, row.objectKey, row.contentType, row.sizeBytes, row.now)
    .run()
}

export async function findVideoUpload(db: D1Database, id: string) {
  return db.prepare(`SELECT * FROM video_uploads WHERE id = ?`).bind(id).first<VideoUploadRow>()
}

// Atomic single use: only the first submission to claim an upload gets it.
export async function consumeVideoUpload(
  db: D1Database,
  options: { id: string; playerUuid: string; submissionUuid: string; now: number }
) {
  const result = await db.prepare(
    `UPDATE video_uploads
     SET consumed_at = ?, submission_uuid = ?
     WHERE id = ? AND player_uuid = ? AND consumed_at IS NULL AND created_at >= ?`
  )
    .bind(options.now, options.submissionUuid, options.id, options.playerUuid, options.now - UPLOAD_CONSUME_WINDOW_SECONDS)
    .run()
  return result.meta.changes === 1
}

export async function countRecentVideoUploads(db: D1Database, playerUuid: string, sinceSeconds: number) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM video_uploads WHERE player_uuid = ? AND created_at >= ?`
  )
    .bind(playerUuid, sinceSeconds)
    .first<{ count: number }>()
  return Number(row?.count || 0)
}

export async function markSubmissionVideoQueued(
  db: D1Database,
  submissionUuid: string,
  source: { type: "upload" | "medal"; ref: string },
  now: number
) {
  await db.prepare(
    `UPDATE submissions
     SET video_status = 'processing', video_error = NULL, video_source_type = ?, video_source_ref = ?, video_updated_at = ?
     WHERE uuid = ?`
  )
    .bind(source.type, source.ref, now, submissionUuid)
    .run()
}

export type VideoResult = {
  status: "ready" | "failed"
  error: string | null
  original_kept: boolean
  width: number | null
  height: number | null
  fps: number | null
  duration_seconds: number | null
}

// Result of a new submission's processing. Only applies while the
// submission is still waiting on it, so a late duplicate can't flip a
// ready video back to failed.
export async function applySubmissionVideoResult(db: D1Database, uuid: string, result: VideoResult, now: number) {
  const ready = result.status === "ready"
  const outcome = await db.prepare(
    `UPDATE submissions SET
       video_status = ?,
       video_error = ?,
       video_width = ?, video_height = ?, video_fps = ?, video_duration = ?,
       original_key = CASE WHEN ? THEN 'originals/' || uuid ELSE original_key END,
       video_updated_at = ?,
       video_processed_at = ?
     WHERE uuid = ? AND video_status = 'processing'`
  )
    .bind(
      ready ? "ready" : "failed",
      ready ? null : result.error,
      result.width, result.height, result.fps, result.duration_seconds,
      ready && result.original_kept ? 1 : 0,
      now,
      now,
      uuid
    )
    .run()
  return outcome.meta.changes === 1
}

// Result of a backfill run on a legacy video. The submission stays "ready"
// either way (its existing video is still published); a failure is just
// recorded so the backfill moves on instead of retrying it forever.
export async function applyBackfillVideoResult(db: D1Database, uuid: string, result: VideoResult, now: number) {
  const ready = result.status === "ready"
  await db.prepare(
    `UPDATE submissions SET
       video_error = ?,
       video_width = COALESCE(?, video_width), video_height = COALESCE(?, video_height),
       video_fps = COALESCE(?, video_fps), video_duration = COALESCE(?, video_duration),
       original_key = CASE WHEN ? THEN 'originals/' || uuid ELSE original_key END,
       video_updated_at = ?,
       video_processed_at = ?
     WHERE uuid = ?`
  )
    .bind(
      ready ? null : result.error,
      result.width, result.height, result.fps, result.duration_seconds,
      ready && result.original_kept ? 1 : 0,
      now,
      now,
      uuid
    )
    .run()
}

// Claims the next legacy video for the backfill (oldest first). The claim
// is the conditional UPDATE itself, so two concurrent callers can never
// claim the same row.
export async function claimNextBackfillSubmission(db: D1Database, now: number) {
  const row = await db.prepare(
    `UPDATE submissions
     SET video_backfill_claimed_at = ?
     WHERE uuid = (
       SELECT uuid FROM submissions
       WHERE video_processed_at IS NULL
         AND video_status = 'ready'
         AND (video_backfill_claimed_at IS NULL OR video_backfill_claimed_at < ?)
       ORDER BY date ASC, uuid ASC
       LIMIT 1
     )
       AND video_processed_at IS NULL
       AND (video_backfill_claimed_at IS NULL OR video_backfill_claimed_at < ?)
     RETURNING uuid`
  )
    .bind(now, now - BACKFILL_CLAIM_TIMEOUT_SECONDS, now - BACKFILL_CLAIM_TIMEOUT_SECONDS)
    .first<{ uuid: string }>()
  return row?.uuid ?? null
}

// The claim timestamp is left in place after a backfill item finishes, so
// "any row was ever claimed" is what tells the daily sweep that an owner
// started a backfill it should keep going.
export async function getBackfillStats(db: D1Database, now: number) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN video_backfill_claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS claimed,
       SUM(CASE WHEN video_processed_at IS NULL THEN 1 ELSE 0 END) AS remaining,
       SUM(CASE WHEN video_processed_at IS NULL AND video_backfill_claimed_at >= ? THEN 1 ELSE 0 END) AS in_flight,
       SUM(CASE WHEN video_processed_at IS NOT NULL AND video_error IS NOT NULL AND video_status = 'ready' THEN 1 ELSE 0 END) AS failed
     FROM submissions
     WHERE video_status = 'ready'`
  )
    .bind(now - BACKFILL_CLAIM_TIMEOUT_SECONDS)
    .first<{ claimed: number | null; remaining: number | null; in_flight: number | null; failed: number | null }>()

  return {
    started: Number(row?.claimed || 0) > 0,
    remaining: Number(row?.remaining || 0),
    inFlight: Number(row?.in_flight || 0),
    failed: Number(row?.failed || 0),
  }
}

export async function listStuckProcessingSubmissions(db: D1Database, now: number, limit: number) {
  const rows = await db.prepare(
    `SELECT uuid, video_source_type, video_source_ref
     FROM submissions
     WHERE video_status = 'processing' AND video_updated_at < ?
     ORDER BY video_updated_at ASC
     LIMIT ?`
  )
    .bind(now - STUCK_PROCESSING_SECONDS, limit)
    .all<{ uuid: string; video_source_type: string | null; video_source_ref: string | null }>()
  return rows.results || []
}

export async function touchSubmissionVideo(db: D1Database, uuid: string, now: number) {
  await db.prepare(`UPDATE submissions SET video_updated_at = ? WHERE uuid = ?`).bind(now, uuid).run()
}

export async function failStuckSubmissionVideo(db: D1Database, uuid: string, error: string, now: number) {
  await db.prepare(
    `UPDATE submissions SET video_status = 'failed', video_error = ?, video_updated_at = ?, video_processed_at = ?
     WHERE uuid = ? AND video_status = 'processing'`
  )
    .bind(error, now, now, uuid)
    .run()
}

export async function deleteOldVideoUploads(db: D1Database, before: number) {
  const result = await db.prepare(`DELETE FROM video_uploads WHERE created_at < ?`).bind(before).run()
  return result.meta.changes
}

// The PB the player had on this trial before this submission, for the
// Discord pending-run post (which used to be sent at creation time, before
// the new submission existed).
export async function findPreviousPersonalBest(db: D1Database, playerUuid: string, trialName: string, excludeUuid: string) {
  const row = await db.prepare(
    `SELECT MIN(time) AS time FROM submissions
     WHERE player_uuid = ? AND trial_name = ? AND state != 'denied' AND uuid != ?`
  )
    .bind(playerUuid, trialName, excludeUuid)
    .first<{ time: number | null }>()
  return row?.time == null ? undefined : Number(row.time)
}
