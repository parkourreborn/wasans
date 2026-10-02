-- Server-side video processing for trial submissions.
--
-- Players now upload straight to the private wasans-uploads R2 bucket with a
-- short-lived presigned URL (one video_uploads row per URL), and every
-- video, uploaded or from a Medal link, goes through the wasans-video
-- Worker's container: remuxed or transcoded to H.264 MP4 (<=1080p,
-- <=60fps) with a server-generated thumbnail. See video-worker/README.md.
--
-- Existing submissions default to video_status 'ready' (their video is
-- already published) with video_processed_at NULL, which is what the /admin
-- backfill uses to find videos that predate processing.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0019_video_processing.sql

ALTER TABLE submissions ADD COLUMN video_status TEXT NOT NULL DEFAULT 'ready'
  CHECK (video_status IN ('processing', 'ready', 'failed'));
ALTER TABLE submissions ADD COLUMN video_error TEXT;
-- 'upload' (incoming/ key) or 'medal' (clip URL): what to re-queue a stuck
-- job from.
ALTER TABLE submissions ADD COLUMN video_source_type TEXT;
ALTER TABLE submissions ADD COLUMN video_source_ref TEXT;
ALTER TABLE submissions ADD COLUMN video_width INTEGER;
ALTER TABLE submissions ADD COLUMN video_height INTEGER;
ALTER TABLE submissions ADD COLUMN video_fps REAL;
ALTER TABLE submissions ADD COLUMN video_duration REAL;
-- originals/{uuid} in wasans-uploads, when a private original exists.
ALTER TABLE submissions ADD COLUMN original_key TEXT;
ALTER TABLE submissions ADD COLUMN video_updated_at INTEGER;
ALTER TABLE submissions ADD COLUMN video_processed_at INTEGER;
ALTER TABLE submissions ADD COLUMN video_backfill_claimed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_submissions_video_status ON submissions(video_status, video_updated_at);
CREATE INDEX IF NOT EXISTS idx_submissions_video_backfill ON submissions(video_processed_at, video_backfill_claimed_at);

-- One row per presigned upload URL handed out. Consumed (atomically, once)
-- when a submission is created from it.
CREATE TABLE IF NOT EXISTS video_uploads (
  id TEXT PRIMARY KEY,
  player_uuid TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  submission_uuid TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_uploads_player_created ON video_uploads(player_uuid, created_at);
