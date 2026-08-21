import "server-only"

// Rate-limit buckets and idempotency keys are no longer swept inline on
// every request (that turned every lookup into an extra write) — instead
// this runs once a day from the maintenance sweep endpoint. Windows here are
// all <= 1 hour (see call sites of enforceRateLimit), so a day-old bucket is
// long dead; both deletes are independent tables and sent as one D1 batch
// round trip.
export async function cleanupExpiredApiState(db: D1Database) {
  const now = Math.floor(Date.now() / 1000)
  const staleRateLimitBefore = now - 60 * 60 * 24

  const [idempotencyResult, rateLimitResult] = await db.batch<unknown>([
    db.prepare(`DELETE FROM api_idempotency_keys WHERE expires_at <= ?`).bind(now),
    db.prepare(`DELETE FROM api_rate_limits WHERE window_start < ?`).bind(staleRateLimitBefore),
  ])

  return {
    idempotencyKeysDeleted: idempotencyResult.meta.changes,
    rateLimitBucketsDeleted: rateLimitResult.meta.changes,
  }
}
