-- Fresh-install schema. For migrating an existing database with real data,
-- use the migrations/ folder instead (this file DROPs and recreates tables).

DROP TABLE IF EXISTS wrs;
DROP TABLE IF EXISTS pbs;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS oauth_accounts;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS player_ips;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS trials;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS api_idempotency_keys;
DROP TABLE IF EXISTS api_rate_limits;

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
CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
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
  removed_at INTEGER
);

INSERT OR IGNORE INTO trials (name, status, added_at, version) VALUES
  ('Crystal', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Genesis', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Glass', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Riser', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Solar', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Vestibule', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Celsius', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Circulation', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Flow', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Martyr', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Neon Bold', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Sawdust', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Ascension', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Faith', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Gale', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Grip', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Thread', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Umbrel', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Depot', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Flame', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Ironsing', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Monoxide', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Rust Belt', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1),
  ('Wisp', 'active', CAST(strftime('%s', 'now') AS INTEGER) - 31536000, 1);

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
  ('moderation_enabled', 1, CAST(strftime('%s', 'now') AS INTEGER));

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
