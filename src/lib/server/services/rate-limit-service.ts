import "server-only"

type RateLimitDecision = {
  allowed: boolean
  remaining: number
  retryAfter: number
  limit: number
}

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

export function getRateLimitKey(request: Request, scope: string, actorUuid?: string | null) {
  const clientIp = getClientIp(request)
  const actor = actorUuid?.trim() || "anonymous"
  return `${scope}:${actor}:${clientIp}`
}

// Atomically bumps the bucket's counter (resetting it first if the window
// has rolled over) and reads back the resulting count, in one D1 round trip
// via INSERT ... ON CONFLICT ... RETURNING. This also fixes a race the old
// two-step SELECT-then-UPDATE had: concurrent requests could both read the
// same pre-increment count and both be let through past the limit. Here the
// increment always happens; requests over the limit are simply the ones
// whose returned count exceeds it, which self-heals once the window rolls.
export async function enforceRateLimit(
  db: D1Database,
  key: string,
  options: {
    limit: number
    windowSeconds: number
  }
): Promise<RateLimitDecision> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % options.windowSeconds)

  const row = await db.prepare(
    `INSERT INTO api_rate_limits (bucket_key, count, window_start, updated_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       count = CASE
         WHEN api_rate_limits.window_start = excluded.window_start THEN api_rate_limits.count + 1
         ELSE 1
       END,
       window_start = excluded.window_start,
       updated_at = excluded.updated_at
     RETURNING count`
  )
    .bind(key, windowStart, now)
    .first<{ count: number }>()

  const count = Number(row?.count ?? 1)
  const allowed = count <= options.limit
  const retryAfter = Math.max(1, options.windowSeconds - (now - windowStart))

  return {
    allowed,
    remaining: Math.max(0, options.limit - count),
    retryAfter,
    limit: options.limit,
  }
}
