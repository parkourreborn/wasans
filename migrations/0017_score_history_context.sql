-- Adds per-row causal context to player_score_history so the score-over-time
-- chart can place dots ("you got a PB", "you got a new WR", "someone else's
-- WR dropped your score") and link them to the triggering submission.
--
-- `source` distinguishes rows the backfill job wrote from rows live tracking
-- wrote, independently of `reason` -- both can share the same reason value
-- (e.g. "pb"), so `reason` alone can no longer tell the backfill job which
-- rows are safe to wipe and regenerate on a re-run.
--
-- Run:
--   wrangler d1 execute wasans --remote --file=migrations/0017_score_history_context.sql

ALTER TABLE player_score_history ADD COLUMN trial_name TEXT;
ALTER TABLE player_score_history ADD COLUMN submission_uuid TEXT;
ALTER TABLE player_score_history ADD COLUMN source TEXT NOT NULL DEFAULT 'live';

-- Reclassify rows written by the old (pre-context) backfill, which tagged
-- every row it wrote with reason='backfill' regardless of what caused it.
UPDATE player_score_history SET source = 'backfill' WHERE reason = 'backfill';

CREATE INDEX IF NOT EXISTS idx_player_score_history_source ON player_score_history(source);
