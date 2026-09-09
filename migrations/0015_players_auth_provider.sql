-- Adds a single reliable provider signal on players, so avatar rendering and
-- Discord-bot notification calls can gate on "is this a Discord player"
-- without inferring it from discord_avatar/discriminator nullability
-- (unreliable -- Discord users can have a null custom avatar too) or joining
-- oauth_accounts into every leaderboard/player-listing query. Existing rows
-- are all Discord today, hence the DEFAULT.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0015_players_auth_provider.sql

ALTER TABLE players ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'discord'
  CHECK (auth_provider IN ('discord', 'google'));
