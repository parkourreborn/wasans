-- Rebuilds every table whose column types are changing (TEXT unix-second
-- strings -> real INTEGER), adds the missing players.score / pbs.trial_name
-- indexes, and drops the v1-only auth_sessions table.
--
-- SQLite has no ALTER COLUMN TYPE, so each table below is rebuilt with the
-- standard recipe: create the new-shape table, copy rows across casting the
-- timestamp columns, drop the old table, rename the new one into place.
-- Indexes live on the old table and are dropped with it, so each block
-- recreates its own indexes at the end.
--
-- Run this locally first, then against a restored copy of backup.sql, then
-- --remote during low traffic. See the plan notes handed to you alongside
-- this file for the exact commands. Not additive-only like 0001-0003 -- this
-- one touches every row of every table it rebuilds.

-- === players ===
CREATE TABLE players_new (
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

INSERT INTO players_new
SELECT
  uuid, player_id, discord_avatar, discord_discriminator, player_name,
  CAST(date_joined AS INTEGER), permission, score, account_status,
  CAST(deactivated_at AS INTEGER), CAST(deleted_at AS INTEGER),
  CAST(legal_terms_accepted_at AS INTEGER), CAST(legal_privacy_accepted_at AS INTEGER),
  legal_version
FROM players;

DROP TABLE players;
ALTER TABLE players_new RENAME TO players;

CREATE INDEX idx_players_account_status ON players(account_status);
CREATE INDEX idx_players_score ON players(score DESC, player_name ASC);

-- === oauth_accounts ===
CREATE TABLE oauth_accounts_new (
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_account_id),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

INSERT INTO oauth_accounts_new
SELECT
  provider, provider_account_id, player_uuid, access_token, refresh_token,
  CAST(expires_at AS INTEGER), CAST(created_at AS INTEGER), CAST(updated_at AS INTEGER)
FROM oauth_accounts;

DROP TABLE oauth_accounts;
ALTER TABLE oauth_accounts_new RENAME TO oauth_accounts;

CREATE INDEX idx_oauth_accounts_player_uuid ON oauth_accounts(player_uuid, updated_at DESC);

-- === player_ips ===
CREATE TABLE player_ips_new (
  player_uuid TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, ip_address),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

INSERT INTO player_ips_new
SELECT player_uuid, ip_address, count, CAST(first_seen AS INTEGER), CAST(last_seen AS INTEGER)
FROM player_ips;

DROP TABLE player_ips;
ALTER TABLE player_ips_new RENAME TO player_ips;

CREATE INDEX idx_player_ips_ip_address ON player_ips(ip_address);

-- === submissions ===
CREATE TABLE submissions_new (
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
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('approved', 'denied', 'pending')),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

INSERT INTO submissions_new
SELECT
  uuid, player_uuid, trial_name, player_name, time, CAST(date AS INTEGER),
  trial_version, moderator_note, moderator_username, thread_id, state
FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;

CREATE INDEX idx_submissions_player_state_trial_date ON submissions(player_uuid, state, trial_name, date);
CREATE INDEX idx_submissions_state_trial_time_date ON submissions(state, trial_name, time, date);
CREATE INDEX idx_submissions_trial_state_date_uuid ON submissions(trial_name, state, date, uuid);
CREATE INDEX idx_submissions_trial_name_version ON submissions(trial_name, trial_version);

-- === wrs ===
CREATE TABLE wrs_new (
  trial_name TEXT PRIMARY KEY,
  submission_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date INTEGER NOT NULL,
  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

INSERT INTO wrs_new
SELECT trial_name, submission_uuid, player_uuid, player_name, time, CAST(date AS INTEGER)
FROM wrs;

DROP TABLE wrs;
ALTER TABLE wrs_new RENAME TO wrs;

-- === pbs ===
CREATE TABLE pbs_new (
  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,
  submission_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, trial_name),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

INSERT INTO pbs_new
SELECT player_uuid, trial_name, submission_uuid, player_name, time, CAST(date AS INTEGER)
FROM pbs;

DROP TABLE pbs;
ALTER TABLE pbs_new RENAME TO pbs;

CREATE INDEX idx_pbs_trial_name ON pbs(trial_name, time ASC);

-- === audit_logs ===
-- created_at here is a SQLite CURRENT_TIMESTAMP string ("YYYY-MM-DD HH:MM:SS"),
-- not a unix-second digit string like the columns above, so this uses
-- strftime('%s', ...) rather than a plain CAST.
CREATE TABLE audit_logs_new (
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
  FOREIGN KEY (actor_uuid) REFERENCES players(uuid)
);

INSERT INTO audit_logs_new
SELECT
  id, CAST(strftime('%s', created_at) AS INTEGER), actor_uuid, actor_name, action,
  entity_type, entity_uuid, target_type, target_uuid, details
FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- === v1 cleanup ===
-- v1-only session table; v2 has used refresh_tokens since it was introduced.
DROP TABLE IF EXISTS auth_sessions;
