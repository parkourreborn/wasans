import "server-only"

let avatarColumnsEnsured = false

export async function ensurePlayerAvatarColumns(db: D1Database) {
  if (avatarColumnsEnsured) {
    return
  }

  const tableInfo = await db.prepare("PRAGMA table_info(players)").all<{ name: string }>()
  const columnNames = new Set((tableInfo.results || []).map((column) => String(column.name || "")))

  if (!columnNames.has("discord_avatar")) {
    await db.prepare("ALTER TABLE players ADD COLUMN discord_avatar TEXT").run()
  }

  if (!columnNames.has("discord_discriminator")) {
    await db.prepare("ALTER TABLE players ADD COLUMN discord_discriminator TEXT").run()
  }

  avatarColumnsEnsured = true
}
