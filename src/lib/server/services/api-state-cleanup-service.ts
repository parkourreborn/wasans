import "server-only"

// How long login IP history is kept. It exists to let moderators spot alt
// accounts around the time of an incident, which is a question about recent
// activity — keeping it indefinitely only grows the amount of personal data
// a future breach would expose.
export const PLAYER_IP_RETENTION_SECONDS = 60 * 60 * 24 * 180

// Refresh tokens are only ever looked up while live or a short way down a
// replaced_by chain, so rows long past their expiry are dead weight that
// still names which players were active when.
const REFRESH_TOKEN_RETENTION_SECONDS = 60 * 60 * 24 * 30

// Rate-limit buckets and idempotency keys are no longer swept inline on
// every request (that turned every lookup into an extra write) — instead
// this runs once a day from the maintenance sweep endpoint. Windows here are
// all <= 1 hour (see call sites of enforceRateLimit), so a day-old bucket is
// long dead. The retention deletes above ride along in the same sweep; all
// four tables are independent and go as one D1 batch round trip.
export async function cleanupExpiredApiState(db: D1Database) {
  const now = Math.floor(Date.now() / 1000)
  const staleRateLimitBefore = now - 60 * 60 * 24
  const staleIpsBefore = now - PLAYER_IP_RETENTION_SECONDS
  const staleTokensBefore = now - REFRESH_TOKEN_RETENTION_SECONDS

  const [idempotencyResult, rateLimitResult, playerIpResult, refreshTokenResult] = await db.batch<unknown>([
    db.prepare(`DELETE FROM api_idempotency_keys WHERE expires_at <= ?`).bind(now),
    db.prepare(`DELETE FROM api_rate_limits WHERE window_start < ?`).bind(staleRateLimitBefore),
    db.prepare(`DELETE FROM player_ips WHERE last_seen < ?`).bind(staleIpsBefore),
    db.prepare(`DELETE FROM refresh_tokens WHERE expires_at < ?`).bind(staleTokensBefore),
  ])

  return {
    idempotencyKeysDeleted: idempotencyResult.meta.changes,
    rateLimitBucketsDeleted: rateLimitResult.meta.changes,
    playerIpsDeleted: playerIpResult.meta.changes,
    refreshTokensDeleted: refreshTokenResult.meta.changes,
  }
}
