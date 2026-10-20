import "server-only"

export type GameVersionRow = {
  name: string
  created_at: number
  created_by: string | null
  run_count: number
}

// Newest first: the first one is what new runs are stamped with.
export async function listGameVersions(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT v.name, v.created_at, v.created_by,
              (SELECT COUNT(*) FROM submissions s WHERE s.game_version = v.name) AS run_count
       FROM game_versions v
       ORDER BY v.created_at DESC, v.rowid DESC`
    )
    .all<GameVersionRow>()
  return (results || []).map((row) => ({ ...row, run_count: Number(row.run_count) }))
}

export async function getLatestGameVersion(db: D1Database) {
  const row = await db
    .prepare(`SELECT name FROM game_versions ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .first<{ name: string }>()
  return row?.name ?? null
}

export async function gameVersionExists(db: D1Database, name: string) {
  return (await db.prepare(`SELECT 1 FROM game_versions WHERE name = ?`).bind(name).first()) !== null
}

// False when a version by that name is already on the list.
export async function addGameVersion(db: D1Database, name: string, createdBy: string, now: number) {
  const outcome = await db
    .prepare(`INSERT INTO game_versions (name, created_at, created_by) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING`)
    .bind(name, now, createdBy)
    .run()
  return outcome.meta.changes === 1
}

// Only a version no run has can go, so a run's version (and its archived
// file's name) never points at one that's gone.
export async function removeUnusedGameVersion(db: D1Database, name: string) {
  const outcome = await db
    .prepare(`DELETE FROM game_versions WHERE name = ? AND NOT EXISTS (SELECT 1 FROM submissions WHERE game_version = ?)`)
    .bind(name, name)
    .run()
  return outcome.meta.changes === 1
}

export async function setSubmissionGameVersion(db: D1Database, uuid: string, version: string) {
  const outcome = await db.prepare(`UPDATE submissions SET game_version = ? WHERE uuid = ?`).bind(version, uuid).run()
  return outcome.meta.changes === 1
}
