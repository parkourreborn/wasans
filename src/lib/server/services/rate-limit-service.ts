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

  const existing = await db.prepare(
    `SELECT bucket_key, count, window_start
     FROM api_rate_limits
     WHERE bucket_key = ?`
  )
    .bind(key)
    .first<{ bucket_key: string; count: number; window_start: number }>()

  if (!existing || Number(existing.window_start) !== windowStart) {
    await db.prepare(
      `INSERT INTO api_rate_limits (bucket_key, count, window_start, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         count = excluded.count,
         window_start = excluded.window_start,
         updated_at = excluded.updated_at`
    )
      .bind(key, windowStart, now)
      .run()

    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfter: options.windowSeconds,
      limit: options.limit,
    }
  }

  const currentCount = Number(existing.count)
  if (currentCount >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, options.windowSeconds - (now - windowStart)),
      limit: options.limit,
    }
  }

  const updatedCount = currentCount + 1
  await db.prepare(
    `UPDATE api_rate_limits
     SET count = ?, updated_at = ?
     WHERE bucket_key = ?`
  )
    .bind(updatedCount, now, key)
    .run()

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - updatedCount),
    retryAfter: Math.max(1, options.windowSeconds - (now - windowStart)),
    limit: options.limit,
  }
}
