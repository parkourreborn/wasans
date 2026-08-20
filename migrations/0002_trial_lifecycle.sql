-- Trial lifecycle: add/remove/change trials without deleting their submission
-- history, with a 7-day grace period before the change affects player scores.
-- Additive only. Run after 0001_v2_refresh_tokens.sql:
--   wrangler d1 execute wasans --remote --file=migrations/0002_trial_lifecycle.sql

ALTER TABLE trials ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE trials ADD COLUMN added_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trials ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE trials ADD COLUMN version_changed_at INTEGER;
ALTER TABLE trials ADD COLUMN removed_at INTEGER;

-- Backfill: existing trials are treated as already-established (well past the
-- 7-day grace) so this migration never retroactively zeroes out live scores.
UPDATE trials
SET added_at = CAST(strftime('%s', 'now') AS INTEGER) - 31536000
WHERE added_at = 0;

-- Every submission is stamped with the trial's version at creation time, so
-- we can tell later whether it still represents the trial's current course.
ALTER TABLE submissions ADD COLUMN trial_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_submissions_trial_name_version ON submissions(trial_name, trial_version);
