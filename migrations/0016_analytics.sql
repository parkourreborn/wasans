-- Analytics: per-player score history (one row per score-affecting event)
-- and daily overall-rank snapshots. Score history is written by
-- refreshPlayerScores (see src/lib/server/player-scores.ts) every time it
-- changes a player's score, tagged with why; rank snapshots are written
-- once a day by a small Cron Trigger job (see
-- src/app/v2/admin/analytics/snapshot-ranks/route.ts) since ranking every
-- player on every score change would mean re-ranking the whole leaderboard
-- far more often than needed for a "rank over time" chart.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0016_analytics.sql

CREATE TABLE IF NOT EXISTS player_score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uuid TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_score_history_player_recorded ON player_score_history(player_uuid, recorded_at);

CREATE TABLE IF NOT EXISTS player_rank_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uuid TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL NOT NULL,
  snapshot_date TEXT NOT NULL,
  UNIQUE (player_uuid, snapshot_date),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_player_date ON player_rank_snapshots(player_uuid, snapshot_date);
