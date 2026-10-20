-- Files from the old WR Drive are copied by the video container (see
-- wr-import-service.ts): it downloads each one from Google Drive, re-encodes
-- it to an H.264 MP4 and puts it at imports/{drive file id}, then it's ready
-- to watch and import (staged_at). encode_queued_at is set while its job
-- runs. The Drive original isn't kept.
--
-- Files already copied are copied again, so they're re-encoded too.
-- Run (after 0024_wr_imports.sql):
--   wrangler d1 execute wasans --remote --file=migrations/0025_wr_import_encoding.sql

ALTER TABLE wr_imports ADD COLUMN encode_queued_at INTEGER;

UPDATE wr_imports SET staged_at = NULL, copy_error = NULL WHERE status = 'pending';
