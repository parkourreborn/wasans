-- Owners pick which game version is current (the one new runs are stamped
-- with) instead of it always being the newest one added, so older versions
-- can be added later for old world records without taking over.
--
-- The newest version so far becomes the current one. At most one version
-- can be current.
-- Run (after 0022_wr_archive.sql):
--   wrangler d1 execute wasans --remote --file=migrations/0023_current_game_version.sql

ALTER TABLE game_versions ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0;

UPDATE game_versions
SET is_current = 1
WHERE rowid = (SELECT rowid FROM game_versions ORDER BY created_at DESC, rowid DESC LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_versions_current ON game_versions(is_current) WHERE is_current = 1;
