-- Multiple login methods per player: one Discord, one Google, and any
-- number of Roblox accounts, all in oauth_accounts, any of which can log in.
-- Linking at least one Roblox account becomes a requirement for submitting
-- once the require_roblox_link flag is switched on (seeded OFF below: a new
-- Roblox OAuth app is capped at 10 users until Roblox reviews it).
--
-- Before running, check no player already has two links from one provider
-- (the unique index at the end would fail, rolling the whole file back):
--   wrangler d1 execute wasans --remote --command="SELECT player_uuid, provider, COUNT(*) AS c FROM oauth_accounts GROUP BY player_uuid, provider HAVING c > 1"
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0020_linked_accounts.sql

-- players.auth_provider stays "how this account was created", widened to
-- allow 'roblox'. SQLite can't alter a CHECK in place and rebuilding players
-- means rebuilding everything that references it (see 0004), so the column
-- is swapped instead: DROP COLUMN is allowed because its CHECK only names
-- itself and nothing indexes it.
ALTER TABLE players ADD COLUMN auth_provider_next TEXT NOT NULL DEFAULT 'discord'
  CHECK (auth_provider_next IN ('discord', 'google', 'roblox'));
UPDATE players SET auth_provider_next = auth_provider;
ALTER TABLE players DROP COLUMN auth_provider;
ALTER TABLE players RENAME COLUMN auth_provider_next TO auth_provider;

-- The linked Discord account, if any. Avatars and the bot's DMs used to
-- read Discord off player_id + auth_provider, which stops being true once a
-- Google or Roblox account can link Discord later (or unlink it).
ALTER TABLE players ADD COLUMN discord_id TEXT;

UPDATE players
SET discord_id = COALESCE(
  (SELECT oauth_accounts.provider_account_id
   FROM oauth_accounts
   WHERE oauth_accounts.player_uuid = players.uuid
     AND oauth_accounts.provider = 'discord'
   ORDER BY oauth_accounts.updated_at DESC
   LIMIT 1),
  CASE WHEN players.auth_provider = 'discord' THEN players.player_id END
)
WHERE COALESCE(account_status, 'active') != 'deleted';

-- Which linked Roblox account's headshot is the player's avatar. Never sent
-- to clients as-is: /v2/players/{uuid}/avatar resolves it server-side so a
-- public avatar doesn't hand out the Roblox user id behind it.
ALTER TABLE players ADD COLUMN avatar_roblox_id TEXT;

-- Roblox username / display name as of the last login or link with that
-- account. Moderators get live names from Roblox; these are the fallback.
-- Left NULL for Discord and Google, which store nothing beyond the id.
ALTER TABLE oauth_accounts ADD COLUMN username TEXT;
ALTER TABLE oauth_accounts ADD COLUMN display_name TEXT;

INSERT OR IGNORE INTO feature_flags (key, enabled, updated_at) VALUES
  ('require_roblox_link', 0, CAST(strftime('%s', 'now') AS INTEGER));

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_one_per_provider
  ON oauth_accounts(player_uuid, provider)
  WHERE provider IN ('discord', 'google');
