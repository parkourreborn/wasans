-- Combo leaderboard: a second, fully independent leaderboard where players
-- submit a YouTube link + a combo count (higher is better) for a
-- category (gearless/yank/swing/mag, admin-configurable). Reuses the
-- existing moderator/audit/submission_bans infrastructure, but never
-- touches players.score, pbs, wrs, or any trial scoring logic. Apply with:
--   wrangler d1 execute wasans --remote --file=migrations/0007_combos.sql
-- (drop --remote to apply to your local dev DB first)

CREATE TABLE IF NOT EXISTS combo_categories (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO combo_categories (slug, label, status, sort_order, added_at) VALUES
  ('gearless', 'Gearless', 'active', 0, CAST(strftime('%s','now') AS INTEGER)),
  ('yank',     'Yank',     'active', 1, CAST(strftime('%s','now') AS INTEGER)),
  ('swing',    'Swing',    'active', 2, CAST(strftime('%s','now') AS INTEGER)),
  ('mag',      'Mag',      'active', 3, CAST(strftime('%s','now') AS INTEGER));

CREATE TABLE IF NOT EXISTS combo_submissions (
  uuid TEXT PRIMARY KEY,
  player_uuid TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  player_name TEXT NOT NULL,
  combo_count INTEGER NOT NULL,
  youtube_url TEXT NOT NULL,
  date INTEGER NOT NULL,
  moderator_note TEXT,
  moderator_username TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('approved', 'denied', 'pending')),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (category_slug) REFERENCES combo_categories(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_combo_submissions_player_state_category_date ON combo_submissions(player_uuid, state, category_slug, date);
CREATE INDEX IF NOT EXISTS idx_combo_submissions_state_category_count_date ON combo_submissions(state, category_slug, combo_count DESC, date ASC);
CREATE INDEX IF NOT EXISTS idx_combo_submissions_category_state_date_uuid ON combo_submissions(category_slug, state, date, uuid);

-- One row per (player, category) = their best approved submission, the
-- combo analog of pbs.
CREATE TABLE IF NOT EXISTS combo_pbs (
  player_uuid TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  submission_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  combo_count INTEGER NOT NULL,
  date INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, category_slug),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (submission_uuid) REFERENCES combo_submissions(uuid) ON DELETE CASCADE,
  FOREIGN KEY (category_slug) REFERENCES combo_categories(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_combo_pbs_category_slug ON combo_pbs(category_slug, combo_count DESC, date ASC);

INSERT OR IGNORE INTO feature_flags (key, enabled, updated_at) VALUES
  ('combo_submissions_enabled', 1, CAST(strftime('%s','now') AS INTEGER));
