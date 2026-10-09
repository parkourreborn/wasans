import "server-only"
import { getClientIp } from "@/lib/server/client-ip"

// Only one write per (player, ip) per this window. The old version wrote on
// every authenticated request — a DB write on the hot path of basically
// every API call. Debouncing in the statement itself (the ON CONFLICT WHERE)
// keeps it a single round trip that is a cheap no-op within the window, so
// `count` becomes "15-minute windows this ip was seen in" rather than a raw
// request tally, which is all the moderator IP view needs.
const IP_TRACK_DEBOUNCE_SECONDS = 15 * 60

export async function trackPlayerIp(db: D1Database, playerUuid: string, request: Request) {
  const ipAddress = getClientIp(request)
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(
    `INSERT INTO player_ips (player_uuid, ip_address, count, first_seen, last_seen)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(player_uuid, ip_address) DO UPDATE SET
       count = player_ips.count + 1,
       last_seen = excluded.last_seen
     WHERE excluded.last_seen - player_ips.last_seen >= ?`
  )
    .bind(playerUuid, ipAddress, now, now, IP_TRACK_DEBOUNCE_SECONDS)
    .run()
}
