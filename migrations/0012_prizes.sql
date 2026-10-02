-- Owner-managed prizes: a reward tied to a fixed criteria type (new trial WR,
-- new combo WR, rank-up, score reached a target). The system auto-detects a
-- qualifying event and raises a prize_candidates row that the owner must
-- confirm or reject before it becomes an official prize_winners row (hybrid
-- detection) -- see src/lib/server/prize-candidate-checker.ts.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0012_prizes.sql

CREATE TABLE IF NOT EXISTS prizes (
  uuid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,

  criteria_type TEXT NOT NULL
    CHECK (criteria_type IN ('trial_wr', 'combo_wr', 'rankup', 'score_reached')),
  -- Parameters are all optional/nullable: null means "any" for trial_wr /
  -- combo_wr / rankup, and criteria_score_target is only meaningful for
  -- score_reached.
  criteria_trial_name TEXT,
  criteria_combo_category_slug TEXT,
  criteria_target_role_id TEXT,
  criteria_score_target REAL,

  max_winners INTEGER,
  ends_at INTEGER,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'won', 'closed')),
  closed_at INTEGER,
  closed_by_uuid TEXT,
  closed_by_name TEXT,

  created_at INTEGER NOT NULL,
  created_by_uuid TEXT,
  created_by_name TEXT,

  -- SET NULL rather than CASCADE for the criteria params: deleting the
  -- referenced trial/category should widen the prize to "any", not destroy
  -- it (unlike wrs/pbs, a prize isn't owned by its criteria parameter).
  FOREIGN KEY (criteria_trial_name) REFERENCES trials(name) ON DELETE SET NULL,
  FOREIGN KEY (criteria_combo_category_slug) REFERENCES combo_categories(slug) ON DELETE SET NULL,
  FOREIGN KEY (closed_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
  FOREIGN KEY (created_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prizes_status_created_at ON prizes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prizes_criteria_type_status ON prizes(criteria_type, status);

CREATE TABLE IF NOT EXISTS prize_winners (
  uuid TEXT PRIMARY KEY,
  prize_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  candidate_uuid TEXT,

  awarded_at INTEGER NOT NULL,
  awarded_by_uuid TEXT,
  awarded_by_name TEXT,

  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  claimed_at INTEGER,
  claimed_by_uuid TEXT,
  claimed_by_name TEXT,

  -- A player can only hold one live winner row per prize at a time; removing
  -- a winner deletes the row, which frees them to become a candidate again.
  UNIQUE (prize_uuid, player_uuid),

  FOREIGN KEY (prize_uuid) REFERENCES prizes(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (awarded_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prize_winners_prize_uuid ON prize_winners(prize_uuid);
CREATE INDEX IF NOT EXISTS idx_prize_winners_player_uuid ON prize_winners(player_uuid);

CREATE TABLE IF NOT EXISTS prize_candidates (
  uuid TEXT PRIMARY KEY,
  prize_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  -- Opaque JSON snapshot for the admin review UI (e.g. submission uuid, trial
  -- name, time/score at detection) -- display-only, never queried, same
  -- pattern as audit_logs.details.
  event_details TEXT,

  detected_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by_uuid TEXT,
  reviewed_by_name TEXT,
  resulting_winner_uuid TEXT,

  FOREIGN KEY (prize_uuid) REFERENCES prizes(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
  FOREIGN KEY (resulting_winner_uuid) REFERENCES prize_winners(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prize_candidates_status_detected_at ON prize_candidates(status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_prize_candidates_prize_player_status ON prize_candidates(prize_uuid, player_uuid, status);
