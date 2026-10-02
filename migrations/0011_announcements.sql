-- Owner-postable site-wide announcements, shown as a dismissible banner.
-- Dismissal is tracked per-account (announcement_dismissals) so it stays
-- dismissed across devices, rather than per-browser localStorage.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0011_announcements.sql

CREATE TABLE IF NOT EXISTS announcements (
  uuid TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  link_url TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  created_by_uuid TEXT,
  created_by_name TEXT,
  FOREIGN KEY (created_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_dismissals (
  announcement_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_uuid, player_uuid),
  FOREIGN KEY (announcement_uuid) REFERENCES announcements(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_player ON announcement_dismissals(player_uuid);
