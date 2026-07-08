import "server-only"

let avatarColumnsEnsured = false

const playerColumns: Record<string, string> = {
  discord_avatar: "ALTER TABLE players ADD COLUMN discord_avatar TEXT",
  discord_discriminator: "ALTER TABLE players ADD COLUMN discord_discriminator TEXT",
  account_status: "ALTER TABLE players ADD COLUMN account_status TEXT DEFAULT 'active'",
  deactivated_at: "ALTER TABLE players ADD COLUMN deactivated_at TEXT",
  deleted_at: "ALTER TABLE players ADD COLUMN deleted_at TEXT",
  legal_terms_accepted_at: "ALTER TABLE players ADD COLUMN legal_terms_accepted_at TEXT",
  legal_privacy_accepted_at: "ALTER TABLE players ADD COLUMN legal_privacy_accepted_at TEXT",
  legal_version: "ALTER TABLE players ADD COLUMN legal_version TEXT",
}

export async function ensurePlayerAvatarColumns(db: D1Database) {
  if (avatarColumnsEnsured) {
    return
  }

  const tableInfo = await db.prepare("PRAGMA table_info(players)").all<{ name: string }>()
  const columnNames = new Set((tableInfo.results || []).map((column) => String(column.name || "")))

  for (const [columnName, sql] of Object.entries(playerColumns)) {
    if (!columnNames.has(columnName)) {
      await db.prepare(sql).run()
    }
  }

  avatarColumnsEnsured = true
}
