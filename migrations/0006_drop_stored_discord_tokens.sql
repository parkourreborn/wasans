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

-- Note on reclaiming the freed pages: D1 does not accept VACUUM, so the old
-- bytes may linger in pages SQLite has marked free until they are reused.
-- That is why the UPDATE above overwrites the values before the columns are
-- dropped — a DROP COLUMN on its own would leave the secrets readable in the
-- file. If you want the pages actually reclaimed, export and re-import the
-- database; it is not required for the tokens to be unusable, since dropping
-- them here does not revoke them at Discord either way (see the note below).
--
-- Anything already exfiltrated stays valid until it expires or the player
-- re-authorises. If you have reason to think the database was ever exposed,
-- rotate the Discord application's client secret in the developer portal,
-- which invalidates the refresh tokens issued under it.
