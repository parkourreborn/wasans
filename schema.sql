-- Table cleanup
DROP TABLE IF EXISTS wrs;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS oauth_accounts;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS trials;

-- Players
CREATE TABLE players (
  uuid TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  date_joined TEXT NOT NULL,
  permission INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0
);

CREATE TABLE auth_sessions (
  token TEXT PRIMARY KEY,
  player_uuid TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_account_id),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

-- Trials (name is now the primary key)
CREATE TABLE trials (
  name TEXT PRIMARY KEY
);

INSERT OR IGNORE INTO trials (name) VALUES
  ('Crystal'),
  ('Genesis'),
  ('Glass'),
  ('Riser'),
  ('Solar'),
  ('Vestibule'),
  ('Celsius'),
  ('Circulation'),
  ('Flow'),
  ('Martyr'),
  ('Neon Bold'),
  ('Sawdust'),
  ('Ascension'),
  ('Faith'),
  ('Gale'),
  ('Grip'),
  ('Thread'),
  ('Umbrel'),
  ('Depot'),
  ('Flame'),
  ('Ironsing'),
  ('Monoxide'),
  ('Rust Belt'),
  ('Wisp');

-- Submissions
DROP TABLE IF EXISTS submissions;
CREATE TABLE submissions (
  uuid TEXT PRIMARY KEY,

  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,

  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date TEXT NOT NULL,
  moderator_note TEXT,

  moderator_username TEXT,

  thread_id TEXT DEFAULT NULL,

  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('approved', 'denied', 'pending')),

  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

-- WRs
DROP TABLE IF EXISTS wrs;
CREATE TABLE wrs (
  trial_name TEXT PRIMARY KEY,
  submission_uuid TEXT NOT NULL,

  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date TEXT NOT NULL,

  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

-- Personal bests
DROP TABLE IF EXISTS pbs;
CREATE TABLE pbs (
  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,
  submission_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (player_uuid, trial_name),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

-- Audit logs for submissions, WRs and moderation actions
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_uuid TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_uuid TEXT,
  target_type TEXT,
  target_uuid TEXT,
  details TEXT,
  FOREIGN KEY (actor_uuid) REFERENCES players(uuid)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_player_state_trial_date ON submissions(player_uuid, state, trial_name, date);
CREATE INDEX IF NOT EXISTS idx_submissions_state_trial_time_date ON submissions(state, trial_name, time, date);
CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(date);
CREATE INDEX IF NOT EXISTS idx_submissions_trial_name ON submissions(trial_name);
CREATE INDEX IF NOT EXISTS idx_pbs_player_trial ON pbs(player_uuid, trial_name);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_expires ON auth_sessions(token, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_player_uuid ON auth_sessions(player_uuid);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_player ON oauth_accounts(provider, provider_account_id, player_uuid);
