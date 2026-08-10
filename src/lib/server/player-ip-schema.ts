import "server-only"

let playerIpTableEnsured = false

function getClientIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim()
  if (cfIp) {
    return cfIp
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) {
    return forwarded
  }

  return "unknown"
}

export async function ensurePlayerIpTable(db: D1Database) {
  if (playerIpTableEnsured) {
    return
  }

  const tableInfo = await db.prepare("PRAGMA table_info(player_ips)").all<{ name: string }>()
  const hasTable = (tableInfo.results || []).length > 0

  if (!hasTable) {
    await db.prepare(
      `CREATE TABLE player_ips (
        player_uuid TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (player_uuid, ip_address),
        FOREIGN KEY (player_uuid) REFERENCES players(uuid)
      )`
    ).run()

    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_player_ips_player_uuid ON player_ips(player_uuid)`
    ).run()
    await db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_player_ips_ip_address ON player_ips(ip_address)`
    ).run()
  }

  playerIpTableEnsured = true
}

export async function trackPlayerIp(db: D1Database, playerUuid: string, request: Request) {
  await ensurePlayerIpTable(db)

  const ipAddress = getClientIp(request)
  const now = String(Math.floor(Date.now() / 1000))

  await db.prepare(
    `INSERT INTO player_ips (player_uuid, ip_address, count, first_seen, last_seen)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(player_uuid, ip_address) DO UPDATE SET
       count = player_ips.count + 1,
       last_seen = excluded.last_seen`
  )
    .bind(playerUuid, ipAddress, now, now)
    .run()
}
