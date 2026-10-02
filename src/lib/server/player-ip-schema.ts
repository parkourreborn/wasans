import "server-only"
import { getClientIp } from "@/lib/server/client-ip"

export async function trackPlayerIp(db: D1Database, playerUuid: string, request: Request) {
  const ipAddress = getClientIp(request)
  const now = Math.floor(Date.now() / 1000)

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
