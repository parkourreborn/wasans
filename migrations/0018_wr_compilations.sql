-- WR compilation videos: one row per render, whether started by the
-- monthly cron or by an owner from /admin. The main app inserts the row
-- (with the exact WR list it asked for, in entries_json) and hands the job
-- to the wasans-wr-compilations Worker (video-worker/), whose container
-- reports progress and the result back into the same row.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0018_wr_compilations.sql

CREATE TABLE IF NOT EXISTS wr_compilations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),
  requested_by_uuid TEXT,
  requested_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'uploading', 'done', 'failed')),
  object_key TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  skipped_json TEXT,
  chapters_json TEXT,
  duration_seconds REAL,
  size_bytes INTEGER,
  youtube_video_id TEXT,
  youtube_url TEXT,
  youtube_error TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_wr_compilations_created ON wr_compilations(created_at);
CREATE INDEX IF NOT EXISTS idx_wr_compilations_status ON wr_compilations(status);
