import "server-only"
import { getClientIp } from "@/lib/server/client-ip"
import { jsonError } from "@/lib/server/http"

type RateLimitDecision = {
  allowed: boolean
  remaining: number
  retryAfter: number
  limit: number
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

// Per-IP guard for the public, unauthenticated read endpoints (the list and
// leaderboard GETs). It is the volume lever against the cache-key
// amplification in F-02 — alongside not caching free-text searches and
// best-effort KV writes — capping how fast one client can drive these
// queries. Returns a ready 429 Response to short-circuit on, or null to
// continue. Keyed per-IP, plus the actor when the caller is signed in, so a
// logged-in user gets their own bucket instead of sharing their NAT's. The
// default limit is deliberately generous: these endpoints sit behind shared
// NAT / carrier networks and drive search-as-you-type, so it only trips a
// scripted flood, never ordinary browsing.
export async function enforcePublicReadLimit(
  db: D1Database,
  request: Request,
  scope: string,
  options?: { actorUuid?: string | null; requestId?: string; limit?: number; windowSeconds?: number }
): Promise<Response | null> {
  const rate = await enforceRateLimit(db, getRateLimitKey(request, scope, options?.actorUuid), {
    limit: options?.limit ?? 300,
    windowSeconds: options?.windowSeconds ?? 60,
  })

  if (rate.allowed) {
    return null
  }

  return jsonError("Rate limit exceeded", 429, {
    code: "rate_limited",
    requestId: options?.requestId,
    details: { retry_after: rate.retryAfter },
    headers: { "retry-after": String(rate.retryAfter) },
  })
}
