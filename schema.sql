-- Fresh-install schema. For migrating an existing database with real data,
-- use the migrations/ folder instead (this file DROPs and recreates tables).

DROP TABLE IF EXISTS wrs;
DROP TABLE IF EXISTS pbs;
DROP TABLE IF EXISTS combo_pbs;
DROP TABLE IF EXISTS combo_submissions;
DROP TABLE IF EXISTS combo_categories;
DROP TABLE IF EXISTS submission_bans;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS oauth_accounts;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS player_ips;
DROP TABLE IF EXISTS announcement_dismissals;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS prize_candidates;
DROP TABLE IF EXISTS prize_winners;
DROP TABLE IF EXISTS prizes;
DROP TABLE IF EXISTS giveaway_winners;
DROP TABLE IF EXISTS giveaway_entries;
DROP TABLE IF EXISTS giveaways;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS trials;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS api_idempotency_keys;
DROP TABLE IF EXISTS api_rate_limits;
DROP TABLE IF EXISTS player_score_history;
DROP TABLE IF EXISTS player_rank_snapshots;

-- Players
CREATE TABLE players (
  uuid TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  discord_avatar TEXT,
  discord_discriminator TEXT,
  player_name TEXT NOT NULL,
  date_joined INTEGER NOT NULL,
  permission INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'deactivated', 'deleted')),
  deactivated_at INTEGER,
  deleted_at INTEGER,
  legal_terms_accepted_at INTEGER,
  legal_privacy_accepted_at INTEGER,
  legal_version TEXT
);

CREATE INDEX idx_players_account_status ON players(account_status);
CREATE INDEX idx_players_score ON players(score DESC, player_name ASC);

-- OAuth-linked accounts (Discord)
-- Deliberately stores only the Discord account id <-> player link. Discord's
-- access/refresh tokens are used once during login and never persisted, so a
-- disclosure of this table cannot be replayed against Discord.
CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_account_id),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_oauth_accounts_player_uuid ON oauth_accounts(player_uuid, updated_at DESC);

-- Login IP tracking
CREATE TABLE player_ips (
  player_uuid TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, ip_address),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_player_ips_ip_address ON player_ips(ip_address);

-- Trials (name is the primary key; lifecycle columns support the grace-period system)
CREATE TABLE trials (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  added_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  version_changed_at INTEGER,
  removed_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO trials (name, status, added_at, version, sort_order) VALUES
  ('Crystal', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 0),
  ('Genesis', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 1),
  ('Glass', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 2),
  ('Riser', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 3),
  ('Solar', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 4),
  ('Vestibule', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 5),
  ('Celsius', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 6),
  ('Circulation', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 7),
  ('Flow', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 8),
  ('Martyr', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 9),
  ('Neon Bold', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 10),
  ('Sawdust', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 11),
  ('Ascension', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 12),
  ('Faith', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 13),
  ('Gale', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 14),
  ('Grip', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 15),
  ('Thread', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 16),
  ('Umbrel', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 17),
  ('Depot', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 18),
  ('Flame', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 19),
  ('Ironsing', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 20),
  ('Monoxide', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 21),
  ('Rust Belt', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 22),
  ('Wisp', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1, 23);

-- Submissions
CREATE TABLE submissions (
  uuid TEXT PRIMARY KEY,

  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,

  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date INTEGER NOT NULL,
  trial_version INTEGER NOT NULL DEFAULT 1,

  moderator_note TEXT,
  moderator_username TEXT,

  thread_id TEXT DEFAULT NULL,

  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('approved', 'denied', 'pending')),

  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

CREATE INDEX idx_submissions_player_state_trial_date ON submissions(player_uuid, state, trial_name, date);
CREATE INDEX idx_submissions_state_trial_time_date ON submissions(state, trial_name, time, date);
CREATE INDEX idx_submissions_trial_state_date_uuid ON submissions(trial_name, state, date, uuid);
CREATE INDEX idx_submissions_trial_name_version ON submissions(trial_name, trial_version);

-- World records (current best per trial)
CREATE TABLE wrs (
  trial_name TEXT PRIMARY KEY,
  submission_uuid TEXT NOT NULL,

  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date INTEGER NOT NULL,

  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

-- Personal bests
CREATE TABLE pbs (
  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,
  submission_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, trial_name),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

CREATE INDEX idx_pbs_trial_name ON pbs(trial_name, time ASC);

-- Submission bans (owner-controlled block on creating new submissions)
CREATE TABLE submission_bans (
  player_uuid TEXT PRIMARY KEY,
  reason TEXT,
  banned_at INTEGER NOT NULL,
  banned_by_uuid TEXT,
  banned_by_name TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_submission_bans_banned_at ON submission_bans(banned_at DESC);

-- Combo leaderboard: a second, fully independent leaderboard where players
-- submit a YouTube link + a combo count (higher is better) for an
-- admin-configurable category. Never touches players.score, pbs, wrs, or
-- any trial scoring logic.
CREATE TABLE combo_categories (
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

-- Combo submissions (analog of submissions)
CREATE TABLE combo_submissions (
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

CREATE INDEX idx_combo_submissions_player_state_category_date ON combo_submissions(player_uuid, state, category_slug, date);
CREATE INDEX idx_combo_submissions_state_category_count_date ON combo_submissions(state, category_slug, combo_count DESC, date ASC);
CREATE INDEX idx_combo_submissions_category_state_date_uuid ON combo_submissions(category_slug, state, date, uuid);

-- Combo personal bests (analog of pbs): one row per (player, category) =
-- their best approved submission.
CREATE TABLE combo_pbs (
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

CREATE INDEX idx_combo_pbs_category_slug ON combo_pbs(category_slug, combo_count DESC, date ASC);

-- Owner-postable site-wide announcements, shown as a dismissible banner.
-- Dismissal is tracked per-account so it stays dismissed across devices.
CREATE TABLE announcements (
  uuid TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  link_url TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  created_by_uuid TEXT,
  created_by_name TEXT,
  FOREIGN KEY (created_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);

CREATE TABLE announcement_dismissals (
  announcement_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_uuid, player_uuid),
  FOREIGN KEY (announcement_uuid) REFERENCES announcements(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_announcement_dismissals_player ON announcement_dismissals(player_uuid);

-- Prizes: a reward tied to a fixed criteria type. The system auto-detects a
-- qualifying event and raises a prize_candidates row that the owner must
-- confirm or reject before it becomes an official prize_winners row -- see
-- src/lib/server/prize-candidate-checker.ts.
CREATE TABLE prizes (
  uuid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,

  criteria_type TEXT NOT NULL
    CHECK (criteria_type IN ('trial_wr', 'combo_wr', 'rankup', 'score_reached')),
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

  FOREIGN KEY (criteria_trial_name) REFERENCES trials(name) ON DELETE SET NULL,
  FOREIGN KEY (criteria_combo_category_slug) REFERENCES combo_categories(slug) ON DELETE SET NULL,
  FOREIGN KEY (closed_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
  FOREIGN KEY (created_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_prizes_status_created_at ON prizes(status, created_at DESC);
CREATE INDEX idx_prizes_criteria_type_status ON prizes(criteria_type, status);

CREATE TABLE prize_winners (
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

  UNIQUE (prize_uuid, player_uuid),

  FOREIGN KEY (prize_uuid) REFERENCES prizes(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (awarded_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_prize_winners_prize_uuid ON prize_winners(prize_uuid);
CREATE INDEX idx_prize_winners_player_uuid ON prize_winners(player_uuid);

CREATE TABLE prize_candidates (
  uuid TEXT PRIMARY KEY,
  prize_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
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

CREATE INDEX idx_prize_candidates_status_detected_at ON prize_candidates(status, detected_at DESC);
CREATE INDEX idx_prize_candidates_prize_player_status ON prize_candidates(prize_uuid, player_uuid, status);

-- Giveaways: a raffle with a fixed winner count and a deadline. Any
-- logged-in player can join once (giveaway_entries' PK is the
-- one-entry-per-user enforcement). Drawing/rerolling is always a manual
-- owner action.
CREATE TABLE giveaways (
  uuid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,

  max_winners INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'won', 'closed')),
  closed_at INTEGER,
  closed_by_uuid TEXT,
  closed_by_name TEXT,

  created_at INTEGER NOT NULL,
  created_by_uuid TEXT,
  created_by_name TEXT,

  FOREIGN KEY (closed_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
  FOREIGN KEY (created_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_giveaways_status_created_at ON giveaways(status, created_at DESC);

CREATE TABLE giveaway_entries (
  giveaway_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  entered_at INTEGER NOT NULL,
  PRIMARY KEY (giveaway_uuid, player_uuid),
  FOREIGN KEY (giveaway_uuid) REFERENCES giveaways(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE TABLE giveaway_winners (
  uuid TEXT PRIMARY KEY,
  giveaway_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  round INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),

  drawn_at INTEGER NOT NULL,
  drawn_by_uuid TEXT,
  drawn_by_name TEXT,

  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  claimed_at INTEGER,
  claimed_by_uuid TEXT,
  claimed_by_name TEXT,

  UNIQUE (giveaway_uuid, player_uuid),

  FOREIGN KEY (giveaway_uuid) REFERENCES giveaways(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (drawn_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_giveaway_winners_giveaway_current ON giveaway_winners(giveaway_uuid, is_current);

-- Audit logs for submissions, WRs, moderation actions, and client/server errors
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  actor_uuid TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_uuid TEXT,
  target_type TEXT,
  target_uuid TEXT,
  details TEXT,
  FOREIGN KEY (actor_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Feature flags (owner-controlled site-wide toggles)
CREATE TABLE feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO feature_flags (key, enabled, updated_at) VALUES
  ('submissions_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER)),
  ('moderation_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER)),
  ('combo_submissions_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER));

-- v2 API: rotating refresh tokens for JWT auth
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_player_uuid ON refresh_tokens(player_uuid);

-- API request idempotency + rate limiting
CREATE TABLE api_idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_uuid TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, idempotency_key, actor_uuid)
);

CREATE INDEX idx_api_idempotency_expires ON api_idempotency_keys(expires_at);

CREATE TABLE api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Analytics: one row per score-affecting event, written by
-- refreshPlayerScores (src/lib/server/player-scores.ts).
CREATE TABLE player_score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uuid TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_player_score_history_player_recorded ON player_score_history(player_uuid, recorded_at);

-- Analytics: daily overall-rank snapshot, written once a day by a Cron
-- Trigger job (src/app/v2/admin/analytics/snapshot-ranks/route.ts).
CREATE TABLE player_rank_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_uuid TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL NOT NULL,
  snapshot_date TEXT NOT NULL,
  UNIQUE (player_uuid, snapshot_date),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE INDEX idx_player_rank_snapshots_player_date ON player_rank_snapshots(player_uuid, snapshot_date);
