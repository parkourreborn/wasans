-- Files copied in from the old WR Drive are re-encoded before they show in
-- the import queue (see wr-import-service.ts): the copy lands at
-- imports/{drive file id} (copied_at), the video container re-encodes it to
-- an H.264 MP4 in place (encode_queued_at while that runs), and then it's
-- ready to watch and import (staged_at). The Drive original isn't kept.
--
-- Files already copied are re-encoded too: they go back to copied.
-- Run (after 0024_wr_imports.sql):
--   wrangler d1 execute wasans --remote --file=migrations/0025_wr_import_encoding.sql

ALTER TABLE wr_imports ADD COLUMN copied_at INTEGER;
ALTER TABLE wr_imports ADD COLUMN encode_queued_at INTEGER;

UPDATE wr_imports SET copied_at = staged_at, staged_at = NULL WHERE status = 'pending' AND staged_at IS NOT NULL;
