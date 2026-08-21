-- Rebuilds every table whose column types are changing (TEXT unix-second
-- strings -> real INTEGER), adds the missing players.score / pbs.trial_name
-- indexes, adds ON DELETE CASCADE/SET NULL to every foreign key so the
-- database enforces referential cleanup instead of application code doing
-- it by hand, and drops the v1-only auth_sessions table.
--
-- SQLite has no ALTER COLUMN TYPE (and no ALTER of a FK's ON DELETE clause
-- either), so this is a standard SQLite table-rebuild, done in three
-- strict phases rather than one drop/rebuild per table in sequence:
--
--   Phase 1: create every "_new" table and copy its data across, while all
--            the ORIGINAL tables still exist under their original names (so
--            every FK reference used during the copy resolves normally).
--   Phase 2: drop every ORIGINAL table, in dependency order -- leaves
--            first (nothing else references them), then submissions (once
--            wrs/pbs, which reference it, are already gone), then players
--            last (once every table that referenced it is already gone).
--   Phase 3: rename every "_new" table into its final name and recreate
--            indexes.
--
-- Why three phases instead of one drop-then-rename per table (which is the
-- usual recipe): DROP TABLE performs an implicit DELETE FROM first when FK
-- enforcement is active, and that delete is checked against every OTHER
-- table's live FK just like a normal DELETE would be. Rebuilding players
-- table-by-table (drop old players, immediately rename players_new into
-- place) still fails even with PRAGMA defer_foreign_keys, because deferred
-- checking is a violation *counter*, not a final-state check -- once that
-- DROP trips it (because 7 other tables still hold live references to the
-- old players table at that moment), no later statement in the same
-- transaction can un-trip it, even after everything is renamed back into a
-- fully consistent final state. PRAGMA foreign_keys=OFF was the other
-- standard workaround, but it's a no-op here: wrangler executes the whole
-- file as one implicit transaction, and SQLite refuses to toggle
-- PRAGMA foreign_keys inside an open transaction.
--
-- Crucially, every "_new" table's FOREIGN KEY below points at OTHER "_new"
-- tables (e.g. wrs_new REFERENCES submissions_new, not submissions) instead
-- of the originals -- if it pointed at the original names, creating it in
-- Phase 1 would immediately make it a live referrer of the original table,
-- permanently blocking that original from ever being dropped in Phase 2,
-- for the exact same reason described above. Since SQLite's ALTER TABLE
-- RENAME automatically rewrites every other table's FK declarations to
-- follow a renamed table (unless PRAGMA legacy_alter_table is on, which it
-- isn't), each Phase 3 rename below quietly patches every "_new REFERENCES
-- whatever_new" declaration into its correct final "REFERENCES whatever"
-- form as a side effect -- no separate patch-up step needed. trials is
-- never touched by this migration, so REFERENCES trials(name) stays as-is
-- throughout; only REFERENCES players/submissions need the _new indirection.
--
-- Run this locally first, then against a restored copy of backup.sql, then
-- --remote during low traffic. See the plan notes handed to you alongside
-- this file for the exact commands. Not additive-only like 0001-0003 -- this
-- one touches every row of every table it rebuilds.
PRAGMA defer_foreign_keys = TRUE;

-- ============================================================
-- Phase 1: create "_new" tables and copy data (originals intact)
-- ============================================================

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
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE
);

INSERT INTO oauth_accounts_new
SELECT
  provider, provider_account_id, player_uuid, access_token, refresh_token,
  CAST(expires_at AS INTEGER), CAST(created_at AS INTEGER), CAST(updated_at AS INTEGER)
FROM oauth_accounts;

CREATE TABLE player_ips_new (
  player_uuid TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, ip_address),
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE
);

INSERT INTO player_ips_new
SELECT player_uuid, ip_address, count, CAST(first_seen AS INTEGER), CAST(last_seen AS INTEGER)
FROM player_ips;

-- Column types are already correct here (added after the TEXT-date era) --
-- rebuilt only to add ON DELETE CASCADE.
CREATE TABLE refresh_tokens_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by TEXT,
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE
);

INSERT INTO refresh_tokens_new SELECT * FROM refresh_tokens;

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
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

INSERT INTO submissions_new
SELECT
  uuid, player_uuid, trial_name, player_name, time, CAST(date AS INTEGER),
  trial_version, moderator_note, moderator_username, thread_id, state
FROM submissions;

-- ON DELETE CASCADE on submission_uuid is the important one here: it's what
-- lets deleting a submission automatically remove its wrs/pbs rows, instead
-- of the app doing three separate DELETEs by hand.
CREATE TABLE wrs_new (
  trial_name TEXT PRIMARY KEY,
  submission_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date INTEGER NOT NULL,
  FOREIGN KEY (submission_uuid) REFERENCES submissions_new(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

INSERT INTO wrs_new
SELECT trial_name, submission_uuid, player_uuid, player_name, time, CAST(date AS INTEGER)
FROM wrs;

CREATE TABLE pbs_new (
  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,
  submission_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  time REAL NOT NULL,
  date INTEGER NOT NULL,
  PRIMARY KEY (player_uuid, trial_name),
  FOREIGN KEY (player_uuid) REFERENCES players_new(uuid) ON DELETE CASCADE,
  FOREIGN KEY (submission_uuid) REFERENCES submissions_new(uuid) ON DELETE CASCADE,
  FOREIGN KEY (trial_name) REFERENCES trials(name) ON DELETE CASCADE
);

INSERT INTO pbs_new
SELECT player_uuid, trial_name, submission_uuid, player_name, time, CAST(date AS INTEGER)
FROM pbs;

-- created_at here is a SQLite CURRENT_TIMESTAMP string ("YYYY-MM-DD HH:MM:SS"),
-- not a unix-second digit string like the columns above, so this uses
-- strftime('%s', ...) rather than a plain CAST.
--
-- actor_uuid uses ON DELETE SET NULL, not CASCADE: audit history should
-- survive even if the actor's player row is ever hard-deleted (actor_name
-- is already a preserved text snapshot for exactly this reason).
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
  FOREIGN KEY (actor_uuid) REFERENCES players_new(uuid) ON DELETE SET NULL
);

INSERT INTO audit_logs_new
SELECT
  id, CAST(strftime('%s', created_at) AS INTEGER), actor_uuid, actor_name, action,
  entity_type, entity_uuid, target_type, target_uuid, details
FROM audit_logs;

-- ============================================================
-- Phase 2: drop every original table, leaves first
-- ============================================================

DROP TABLE IF EXISTS auth_sessions;
DROP TABLE wrs;
DROP TABLE pbs;
DROP TABLE oauth_accounts;
DROP TABLE player_ips;
DROP TABLE refresh_tokens;
DROP TABLE audit_logs;
DROP TABLE submissions;
DROP TABLE players;

-- ============================================================
-- Phase 3: rename into place and recreate indexes
-- ============================================================

ALTER TABLE players_new RENAME TO players;
CREATE INDEX idx_players_account_status ON players(account_status);
CREATE INDEX idx_players_score ON players(score DESC, player_name ASC);

ALTER TABLE oauth_accounts_new RENAME TO oauth_accounts;
CREATE INDEX idx_oauth_accounts_player_uuid ON oauth_accounts(player_uuid, updated_at DESC);

ALTER TABLE player_ips_new RENAME TO player_ips;
CREATE INDEX idx_player_ips_ip_address ON player_ips(ip_address);

ALTER TABLE refresh_tokens_new RENAME TO refresh_tokens;
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_player_uuid ON refresh_tokens(player_uuid);

ALTER TABLE submissions_new RENAME TO submissions;
CREATE INDEX idx_submissions_player_state_trial_date ON submissions(player_uuid, state, trial_name, date);
CREATE INDEX idx_submissions_state_trial_time_date ON submissions(state, trial_name, time, date);
CREATE INDEX idx_submissions_trial_state_date_uuid ON submissions(trial_name, state, date, uuid);
CREATE INDEX idx_submissions_trial_name_version ON submissions(trial_name, trial_version);

ALTER TABLE wrs_new RENAME TO wrs;

ALTER TABLE pbs_new RENAME TO pbs;
CREATE INDEX idx_pbs_trial_name ON pbs(trial_name, time ASC);

ALTER TABLE audit_logs_new RENAME TO audit_logs;
CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

PRAGMA foreign_key_check;
