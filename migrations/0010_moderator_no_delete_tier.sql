-- Introduces a "junior moderator" tier that can moderate everything (trials
-- and combos) except delete submissions, and renames the previous
-- full-access general moderator tier to "senior moderator".
-- players.permission tiers change from
-- 0 = member, 1 = combo moderator, 2 = moderator (general, full), 3 = owner
-- to
-- 0 = member, 1 = combo moderator, 2 = junior moderator (general, no delete),
-- 3 = senior moderator (general, full), 4 = owner.
--
-- Existing moderators (2) and owners (3) already had full delete rights, so
-- they're shifted up one tier to senior moderator (3) / owner (4) to
-- preserve their exact abilities. Combo moderators (1) are untouched. No
-- existing player becomes a junior moderator (2) by this migration -- that
-- tier is newly introduced and must be assigned explicitly afterward.
-- Apply with:
--   wrangler d1 execute wasans --remote --file=migrations/0010_moderator_no_delete_tier.sql
-- (drop --remote to apply to your local dev DB first)

UPDATE players SET permission = permission + 1 WHERE permission >= 2;
