-- Introduces combo moderators. players.permission tiers change from
-- 0 = member, 1 = moderator, 2 = owner
-- to
-- 0 = member, 1 = combo moderator, 2 = moderator (general), 3 = owner.
--
-- Existing moderators (1) and owners (2) could already moderate both trial
-- and combo submissions, so they're shifted up one tier to preserve their
-- exact abilities under the new scheme (general moderator / owner). No
-- existing player becomes a combo moderator (1) by this migration -- that
-- tier is newly introduced and must be assigned explicitly afterward.
-- Apply with:
--   wrangler d1 execute wasans --remote --file=migrations/0009_moderator_tiers.sql
-- (drop --remote to apply to your local dev DB first)

UPDATE players SET permission = permission + 1 WHERE permission >= 1;
