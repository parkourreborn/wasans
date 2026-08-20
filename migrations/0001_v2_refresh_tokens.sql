-- v2 API: rotating refresh tokens for JWT auth.
-- Additive only — does not touch any v1 table (auth_sessions, players, etc).
-- Run with:
--   wrangler d1 execute wasans --remote --file=migrations/0001_v2_refresh_tokens.sql
-- (drop --remote to apply to your local dev DB first)

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_player_uuid ON refresh_tokens(player_uuid);
