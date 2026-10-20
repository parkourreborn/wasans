-- Game versions, review times, and the world record archive.
--
-- Owners keep a list of game versions in /admin/site; every new trial run is
-- stamped with the newest one when it's submitted (game_version), and owners
-- can change any run's version afterwards.
--
-- A run's private original (originals/{uuid} in wasans-uploads) is now
-- deleted by the daily maintenance sweep 7 days after the run is reviewed
-- (reviewed_at), instead of 90 days after upload. Runs that were ever a world
-- record keep theirs for good, moved to
-- world-records/{trial}/{player name} ({player uuid}) {time} ({version})
-- and listed publicly at /archive. original_size and original_source
-- ('original' or 'published', when no original was left and the published
-- video was copied in) describe the archived file.
--
-- reviewed_at for runs reviewed before this column existed comes from their
-- last approval or denial in the audit log. Runs with neither count as
-- reviewed on their submission date.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0022_wr_archive.sql

CREATE TABLE IF NOT EXISTS game_versions (
  name TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

ALTER TABLE submissions ADD COLUMN game_version TEXT;
ALTER TABLE submissions ADD COLUMN reviewed_at INTEGER;
ALTER TABLE submissions ADD COLUMN original_size INTEGER;
ALTER TABLE submissions ADD COLUMN original_source TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_game_version ON submissions(game_version);

UPDATE submissions
SET reviewed_at = reviews.reviewed_at
FROM (
  SELECT entity_uuid, MAX(created_at) AS reviewed_at
  FROM audit_logs
  WHERE entity_type = 'submission' AND action IN ('submission_approved', 'submission_denied')
  GROUP BY entity_uuid
) AS reviews
WHERE reviews.entity_uuid = submissions.uuid
  AND submissions.state != 'pending';
