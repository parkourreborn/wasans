-- Adds reversible trial admin controls: un-retire, un-mark-changed
-- (version un-bump), and manual reordering. Retire/bump-version already
-- existed as one-way transitions; this migration only adds the sort_order
-- column needed for reordering (unretire/un-bump reuse the existing
-- status/version/removed_at/version_changed_at columns, no new columns
-- needed for those). Apply with:
--   wrangler d1 execute wasans --remote --file=migrations/0008_trial_admin_controls.sql
-- (drop --remote to apply to your local dev DB first)

ALTER TABLE trials ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill sort_order to match the existing display order (the literal
-- array order in src/lib/trials.ts) so this migration doesn't visibly
-- reorder anything on deploy.
UPDATE trials SET sort_order = 0 WHERE name = 'Crystal';
UPDATE trials SET sort_order = 1 WHERE name = 'Genesis';
UPDATE trials SET sort_order = 2 WHERE name = 'Glass';
UPDATE trials SET sort_order = 3 WHERE name = 'Riser';
UPDATE trials SET sort_order = 4 WHERE name = 'Solar';
UPDATE trials SET sort_order = 5 WHERE name = 'Vestibule';
UPDATE trials SET sort_order = 6 WHERE name = 'Celsius';
UPDATE trials SET sort_order = 7 WHERE name = 'Circulation';
UPDATE trials SET sort_order = 8 WHERE name = 'Flow';
UPDATE trials SET sort_order = 9 WHERE name = 'Martyr';
UPDATE trials SET sort_order = 10 WHERE name = 'Neon Bold';
UPDATE trials SET sort_order = 11 WHERE name = 'Sawdust';
UPDATE trials SET sort_order = 12 WHERE name = 'Ascension';
UPDATE trials SET sort_order = 13 WHERE name = 'Faith';
UPDATE trials SET sort_order = 14 WHERE name = 'Gale';
UPDATE trials SET sort_order = 15 WHERE name = 'Grip';
UPDATE trials SET sort_order = 16 WHERE name = 'Thread';
UPDATE trials SET sort_order = 17 WHERE name = 'Umbrel';
UPDATE trials SET sort_order = 18 WHERE name = 'Depot';
UPDATE trials SET sort_order = 19 WHERE name = 'Flame';
UPDATE trials SET sort_order = 20 WHERE name = 'Ironsing';
UPDATE trials SET sort_order = 21 WHERE name = 'Monoxide';
UPDATE trials SET sort_order = 22 WHERE name = 'Rust Belt';
UPDATE trials SET sort_order = 23 WHERE name = 'Wisp';
