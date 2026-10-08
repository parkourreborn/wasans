-- Gives the account stored under the player uuid '0' a real one.
--
-- '0' predates generated ids, and it breaks every route that validates a
-- player uuid (they expect 6-64 characters): the profile, avatar, analytics
-- and linked Roblox accounts all answer 400 for it. New accounts get
-- crypto.randomUUID() (auth-service.ts), so this one gets the same shape.
--
-- None of the foreign keys to players(uuid) have ON UPDATE CASCADE, so the
-- player row and every reference to it are rewritten here by hand, in one
-- migration (one transaction). Deferring the FK checks lets the parent row
-- change first: the references briefly point at a missing row, and each
-- UPDATE below clears its share before the transaction commits.
--
-- Sessions keep working: a refresh reads the uuid from refresh_tokens,
-- which is updated here, so the next refresh hands out a token for the new
-- id. Cached API responses that still say '0' expire within a minute.
--
-- Safe to run on a database without a '0' player: every statement then
-- matches nothing.

PRAGMA defer_foreign_keys = TRUE;

UPDATE players SET uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE uuid = '0';

-- Runs, records and scores.
UPDATE submissions SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE pbs SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE wrs SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE combo_submissions SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE combo_pbs SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE video_uploads SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE player_score_history SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE player_rank_snapshots SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';

-- Sign-in and account.
UPDATE oauth_accounts SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE refresh_tokens SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE player_ips SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE submission_bans SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE submission_bans SET banned_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE banned_by_uuid = '0';
UPDATE api_idempotency_keys SET actor_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE actor_uuid = '0';

-- Announcements, prizes and giveaways, as a player and as staff.
UPDATE announcements SET created_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE created_by_uuid = '0';
UPDATE announcement_dismissals SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE prizes SET created_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE created_by_uuid = '0';
UPDATE prizes SET closed_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE closed_by_uuid = '0';
UPDATE prize_winners SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE prize_winners SET awarded_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE awarded_by_uuid = '0';
UPDATE prize_winners SET claimed_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE claimed_by_uuid = '0';
UPDATE prize_candidates SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE prize_candidates SET reviewed_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE reviewed_by_uuid = '0';
UPDATE giveaways SET created_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE created_by_uuid = '0';
UPDATE giveaways SET closed_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE closed_by_uuid = '0';
UPDATE giveaway_entries SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE giveaway_winners SET player_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE player_uuid = '0';
UPDATE giveaway_winners SET drawn_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE drawn_by_uuid = '0';
UPDATE giveaway_winners SET claimed_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE claimed_by_uuid = '0';
UPDATE wr_compilations SET requested_by_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE requested_by_uuid = '0';

-- The audit log: who did it, and which player it was about. Other entity
-- ids (runs, prizes) are never '0', but the type check keeps it exact.
UPDATE audit_logs SET actor_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE actor_uuid = '0';
UPDATE audit_logs SET entity_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE entity_uuid = '0' AND entity_type = 'player';
UPDATE audit_logs SET target_uuid = '54779346-1692-4dee-bfaf-69ed84464e63' WHERE target_uuid = '0' AND target_type = 'player';
