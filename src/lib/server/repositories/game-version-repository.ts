import "server-only"
import { compareVersionsDesc } from "@/lib/wr-archive"

export type GameVersionRow = {
  name: string
  created_at: number
  created_by: string | null
  is_current: boolean
  run_count: number
}

// Highest version first. The current one is what new runs are stamped with.
export async function listGameVersions(db: D1Database): Promise<GameVersionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT v.name, v.created_at, v.created_by, v.is_current,
              (SELECT COUNT(*) FROM submissions s WHERE s.game_version = v.name) AS run_count
       FROM game_versions v`
    )
    .all<{ name: string; created_at: number; created_by: string | null; is_current: number; run_count: number }>()
  return (results || [])
    .map((row) => ({ ...row, is_current: Number(row.is_current) === 1, run_count: Number(row.run_count) }))
    .sort((a, b) => compareVersionsDesc(a.name, b.name))
}

export async function getCurrentGameVersion(db: D1Database) {
  const row = await db.prepare(`SELECT name FROM game_versions WHERE is_current = 1`).first<{ name: string }>()
  return row?.name ?? null
}

export async function gameVersionExists(db: D1Database, name: string) {
  return (await db.prepare(`SELECT 1 FROM game_versions WHERE name = ?`).bind(name).first()) !== null
}

// False when a version by that name is already on the list. `current` also
// makes it the one new runs get.
export async function addGameVersion(db: D1Database, name: string, createdBy: string, now: number, options: { current: boolean }) {
  const outcome = await db
    .prepare(`INSERT INTO game_versions (name, created_at, created_by) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING`)
    .bind(name, now, createdBy)
    .run()
  if (outcome.meta.changes !== 1) return false
  if (options.current) await setCurrentGameVersion(db, name)
  return true
}

// False when there's no version by that name. The old current one is
// cleared in the same batch, and only if the new one exists, so there's
// never a moment with two or (by mistake) none.
export async function setCurrentGameVersion(db: D1Database, name: string) {
  const [, outcome] = await db.batch([
    db
      .prepare(`UPDATE game_versions SET is_current = 0 WHERE is_current = 1 AND name != ? AND EXISTS (SELECT 1 FROM game_versions WHERE name = ?)`)
      .bind(name, name),
    db.prepare(`UPDATE game_versions SET is_current = 1 WHERE name = ?`).bind(name),
  ])
  return outcome.meta.changes === 1
}

// Only a version no run has can go, so a run's version (and its archived
// file's name) never points at one that's gone. The current one stays too,
// so new runs always get a version once there is one.
export async function removeUnusedGameVersion(db: D1Database, name: string) {
  const outcome = await db
    .prepare(`DELETE FROM game_versions WHERE name = ? AND is_current = 0 AND NOT EXISTS (SELECT 1 FROM submissions WHERE game_version = ?)`)
    .bind(name, name)
    .run()
  return outcome.meta.changes === 1
}

export async function setSubmissionGameVersion(db: D1Database, uuid: string, version: string) {
  const outcome = await db.prepare(`UPDATE submissions SET game_version = ? WHERE uuid = ?`).bind(version, uuid).run()
  return outcome.meta.changes === 1
}
