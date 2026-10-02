-- Owner-controlled feature flags (site-wide kill switches). Additive only.
-- Run after 0001 and 0002:
--   wrangler d1 execute wasans --remote --file=migrations/0003_feature_flags.sql

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO feature_flags (key, enabled, updated_at) VALUES
  ('submissions_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER)),
  ('moderation_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER));
