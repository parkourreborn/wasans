-- Players with no account: just a name, for world records imported from
-- the old WR Drive whose player never signed up (see wr-import-service.ts).
--
-- A placeholder has no linked account, so nobody can sign in as it. It's
-- left out of the leaderboards, the players list and search, and site
-- stats; its records show in the record history and the archive and link
-- to its profile. It doesn't hold its name: a real account can sign up
-- with it, and an owner then moves the placeholder's runs over from the
-- admin Players page, which deletes the placeholder.
-- Run (after 0025_wr_import_encoding.sql):
--   wrangler d1 execute wasans --remote --file=migrations/0026_placeholder_players.sql

ALTER TABLE players ADD COLUMN placeholder INTEGER NOT NULL DEFAULT 0;

-- One placeholder per name, so imports with the same name share it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_placeholder_name ON players(LOWER(player_name)) WHERE placeholder = 1;
