-- Tracks the Discord channel/message the bot posts a live-updating giveaway
-- embed to (see notifyGiveawayChanged in giveaway-notify-service.ts and
-- /v3/giveaways/sync in wasans-bot). Nullable because a giveaway only gets
-- these once the bot has successfully posted its first embed; the bot
-- reports the ids back via admin/giveaways/[uuid]/discord-message so future
-- syncs edit that same message instead of posting a duplicate.
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0014_giveaway_discord_message.sql

ALTER TABLE giveaways ADD COLUMN discord_channel_id TEXT;
ALTER TABLE giveaways ADD COLUMN discord_message_id TEXT;
