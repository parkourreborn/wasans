-- World records imported from the old WR Google Drive folder.
--
-- Owners scan the folder from /admin/site/wr-imports: every video in it and
-- its subfolders becomes a wr_imports row, and its file is copied into the
-- private wasans-uploads bucket at imports/{drive file id}. Owners then go
-- through them one at a time (trial, time and player are read from the file
-- name, "{lowercase trial} {time} | {player}") and either:
--  - import it: a new approved run with imported = 1, whose file goes
--    through the video pipeline and into the archive like any other world
--    record's (world-records/...), or
--  - match it to the same run already on the site, which keeps the site's
--    run and file and backdates it to the Drive file's date, or
--  - skip it.
--
-- Imported runs count as world records in the record history, the archive
-- and players' all-time record counts, and nowhere else: they never count
-- toward PBs, WRs, scores, leaderboards or run lists.
-- Run (after 0023_current_game_version.sql):
--   wrangler d1 execute wasans --remote --file=migrations/0024_wr_imports.sql

ALTER TABLE submissions ADD COLUMN imported INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wr_imports (
  drive_file_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  -- The folders between the scanned one and the file, "a/b", or ''.
  folder_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT,
  size INTEGER,
  drive_created_at INTEGER,
  drive_modified_at INTEGER,
  scanned_at INTEGER NOT NULL,
  -- Set once the file is copied to imports/{drive_file_id}.
  staged_at INTEGER,
  copy_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'imported', 'merged', 'skipped')),
  -- The run it became (imported) or was matched to (merged). If that run is
  -- deleted, the file goes back in the queue.
  submission_uuid TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wr_imports_status ON wr_imports(status, staged_at);
CREATE INDEX IF NOT EXISTS idx_wr_imports_submission ON wr_imports(submission_uuid);
