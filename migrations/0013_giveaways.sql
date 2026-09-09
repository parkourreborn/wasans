-- Owner-managed giveaways: a raffle with a fixed winner count and a
-- deadline. Any logged-in player can join once (giveaway_entries' PK is the
-- one-entry-per-user enforcement). Drawing/rerolling is always a manual
-- owner action -- see giveaway-repository.ts drawGiveawayWinners /
-- rerollGiveawayWinners.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0013_giveaways.sql

CREATE TABLE IF NOT EXISTS giveaways (
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

CREATE INDEX IF NOT EXISTS idx_giveaways_status_created_at ON giveaways(status, created_at DESC);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  entered_at INTEGER NOT NULL,
  PRIMARY KEY (giveaway_uuid, player_uuid),
  FOREIGN KEY (giveaway_uuid) REFERENCES giveaways(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaway_winners (
  uuid TEXT PRIMARY KEY,
  giveaway_uuid TEXT NOT NULL,
  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  -- 1 = first draw, 2 = first reroll, ... is_current marks the active round;
  -- a reroll flips every existing row to is_current=0 before inserting the
  -- new round, so claim state and the public winners display can just read
  -- WHERE is_current = 1 while full history stays queryable for audit.
  round INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),

  drawn_at INTEGER NOT NULL,
  drawn_by_uuid TEXT,
  drawn_by_name TEXT,

  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  claimed_at INTEGER,
  claimed_by_uuid TEXT,
  claimed_by_name TEXT,

  -- A player can win a given giveaway at most once, ever -- rerolls exclude
  -- all past winners at the query level; this is a defense-in-depth belt on
  -- top of that.
  UNIQUE (giveaway_uuid, player_uuid),

  FOREIGN KEY (giveaway_uuid) REFERENCES giveaways(uuid) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
  FOREIGN KEY (drawn_by_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway_current ON giveaway_winners(giveaway_uuid, is_current);
