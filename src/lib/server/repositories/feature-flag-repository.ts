import "server-only"

export type FeatureFlagKey = "submissions_enabled" | "moderation_enabled" | "combo_submissions_enabled" | "require_roblox_link"

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  "submissions_enabled",
  "moderation_enabled",
  "combo_submissions_enabled",
  "require_roblox_link",
]

// What a flag reads as when its row (or the table) is missing. Kill
// switches fail open so a missing row can't take the site down; a
// requirement fails closed (off) so a missing row can't lock every player
// out of something.
const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  submissions_enabled: true,
  moderation_enabled: true,
  combo_submissions_enabled: true,
  require_roblox_link: false,
}

export function getFeatureFlagDefault(key: FeatureFlagKey) {
  return FEATURE_FLAG_DEFAULTS[key]
}

export type FeatureFlagRow = {
  key: FeatureFlagKey
  enabled: number
  updated_at: number
  updated_by: string | null
}

// Falls back to FEATURE_FLAG_DEFAULTS if the flag row — or the table
// itself, e.g. before its migration has been applied — is missing.
export async function isFeatureEnabled(db: D1Database, key: FeatureFlagKey): Promise<boolean> {
  try {
    const row = await db.prepare(`SELECT enabled FROM feature_flags WHERE key = ?`).bind(key).first<{ enabled: number }>()
    return row ? Number(row.enabled) === 1 : FEATURE_FLAG_DEFAULTS[key]
  } catch {
    return FEATURE_FLAG_DEFAULTS[key]
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
