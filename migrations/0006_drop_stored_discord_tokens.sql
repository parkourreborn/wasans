-- Removes the stored Discord OAuth tokens and adds retention/cleanup for
-- login IP history. Apply with:
--   wrangler d1 execute wasans --remote --file=migrations/0006_drop_stored_discord_tokens.sql
-- (drop --remote to apply to your local dev DB first)

-- oauth_accounts.access_token / refresh_token were written on every login and
-- never read back. Any disclosure of this table therefore handed out live
-- Discord credentials for every player who had ever signed in. Overwrite the
-- values before dropping the columns so the old bytes are not left behind in
-- pages the DROP simply stops referencing.
UPDATE oauth_accounts SET access_token = NULL, refresh_token = NULL;

ALTER TABLE oauth_accounts DROP COLUMN access_token;
ALTER TABLE oauth_accounts DROP COLUMN refresh_token;
ALTER TABLE oauth_accounts DROP COLUMN expires_at;

-- Login IPs were kept forever, and were left behind when a player deleted
-- their account. Drop the history for accounts that are already deleted;
-- the app now deletes these rows as part of account deletion, and the daily
-- maintenance sweep enforces a retention window from here on.
DELETE FROM player_ips
WHERE player_uuid IN (
  SELECT uuid FROM players WHERE COALESCE(account_status, 'active') = 'deleted'
);

-- VACUUM reclaims the pages the above freed, so the removed values are not
-- recoverable from the database file. D1 runs this as a maintenance no-op if
-- it is unsupported on your version; it is safe either way.
VACUUM;
