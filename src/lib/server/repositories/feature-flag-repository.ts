import "server-only"

export type FeatureFlagKey = "submissions_enabled" | "moderation_enabled"

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = ["submissions_enabled", "moderation_enabled"]

export type FeatureFlagRow = {
  key: FeatureFlagKey
  enabled: number
  updated_at: number
  updated_by: string | null
}

// Fails open (treats as enabled) if the flag row — or the table itself,
// e.g. before its migration has been applied — is missing, so a missing
// flag can never accidentally take the whole site down.
export async function isFeatureEnabled(db: D1Database, key: FeatureFlagKey): Promise<boolean> {
  try {
    const row = await db.prepare(`SELECT enabled FROM feature_flags WHERE key = ?`).bind(key).first<{ enabled: number }>()
    return row ? Number(row.enabled) === 1 : true
  } catch {
    return true
  }
}

export async function listFeatureFlags(db: D1Database): Promise<FeatureFlagRow[]> {
  const { results } = await db.prepare(
    `SELECT key, enabled, updated_at, updated_by FROM feature_flags ORDER BY key ASC`
  ).all<FeatureFlagRow>()

  return results || []
}

export async function setFeatureFlag(db: D1Database, key: FeatureFlagKey, enabled: boolean, updatedBy: string) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(
    `INSERT INTO feature_flags (key, enabled, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(key, enabled ? 1 : 0, now, updatedBy)
    .run()
}
