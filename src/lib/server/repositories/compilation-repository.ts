import "server-only"
import type { CompilationTrigger } from "@/lib/server/compilations"

export type CompilationEntry = {
  trial: string
  time: number
  playerName: string
  playerScore: number
  submissionUuid: string
  videoKey: string
}

export type CompilationRow = {
  id: string
  title: string
  trigger: CompilationTrigger
  requested_by_uuid: string | null
  requested_by_name: string | null
  status: "queued" | "rendering" | "uploading" | "done" | "failed"
  object_key: string
  entries_json: string
  progress_done: number
  progress_total: number
  skipped_json: string | null
  chapters_json: string | null
  duration_seconds: number | null
  size_bytes: number | null
  youtube_video_id: string | null
  youtube_url: string | null
  youtube_error: string | null
  error: string | null
  created_at: number
  updated_at: number
  finished_at: number | null
}

// Current WR for every active trial, in the admin-configured trial order
// (trials.sort_order, the same order /wrs uses), not alphabetical. Same
// deactivated-player rule as listWorldRecords. The score is the player's
// overall score at the moment the compilation is queued.
export async function listCompilationEntries(db: D1Database): Promise<CompilationEntry[]> {
  const rows = await db.prepare(
    `SELECT
       wrs.trial_name,
       wrs.time,
       wrs.player_name,
       wrs.submission_uuid,
       COALESCE(players.score, 0) AS player_score
     FROM wrs
     JOIN trials ON trials.name = wrs.trial_name
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     WHERE trials.status = 'active'
       AND COALESCE(players.account_status, 'active') != 'deactivated'
     ORDER BY trials.sort_order ASC, trials.name ASC`
  ).all<{ trial_name: string; time: number; player_name: string; submission_uuid: string; player_score: number }>()

  return (rows.results || []).map((row) => ({
    trial: row.trial_name,
    time: Number(row.time),
    playerName: row.player_name,
    playerScore: Number(row.player_score),
    submissionUuid: row.submission_uuid,
    videoKey: `scores/${row.submission_uuid}.mp4`,
  }))
}

export async function findInProgressCompilation(db: D1Database) {
  return db.prepare(
    `SELECT * FROM wr_compilations
     WHERE status IN ('queued', 'rendering', 'uploading')
     ORDER BY created_at DESC
     LIMIT 1`
  ).first<CompilationRow>()
}

export async function insertCompilation(
  db: D1Database,
  row: {
    id: string
    title: string
    trigger: CompilationTrigger
    requestedByUuid: string | null
    requestedByName: string | null
    objectKey: string
    entries: CompilationEntry[]
    now: number
  }
) {
  await db.prepare(
    `INSERT INTO wr_compilations (
       id, title, trigger, requested_by_uuid, requested_by_name, status,
       object_key, entries_json, progress_done, progress_total, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.title,
      row.trigger,
      row.requestedByUuid,
      row.requestedByName,
      row.objectKey,
      JSON.stringify(row.entries),
      row.entries.length,
      row.now,
      row.now
    )
    .run()
}

export async function markCompilationFailed(db: D1Database, id: string, error: string, now: number) {
  await db.prepare(
    `UPDATE wr_compilations
     SET status = 'failed', error = ?, updated_at = ?, finished_at = ?
     WHERE id = ? AND status NOT IN ('done', 'failed')`
  )
    .bind(error.slice(0, 2000), now, now, id)
    .run()
}

export async function listCompilations(db: D1Database, limit: number) {
  const rows = await db.prepare(
    `SELECT * FROM wr_compilations ORDER BY created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all<CompilationRow>()

  return rows.results || []
}
