-- Submission bans: owners can block an individual player from creating new
-- submissions without touching their account, permission tier, or history.
-- Additive only. Run after 0004_schema_rebuild.sql:
--   wrangler d1 execute wasans --remote --file=migrations/0005_submission_bans.sql

CREATE TABLE IF NOT EXISTS submission_bans (
  player_uuid TEXT PRIMARY KEY,
  reason TEXT,
  banned_at INTEGER NOT NULL,
  banned_by_uuid TEXT,
  banned_by_name TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_bans_banned_at ON submission_bans(banned_at DESC);
