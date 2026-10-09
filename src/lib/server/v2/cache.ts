import "server-only"

// Workers KV enforces a 60-second minimum on expirationTtl, and writes take
// up to ~60s to propagate globally — so KV alone can't give sub-minute
// freshness. To make sure nothing is ever meaningfully stale, every v2
// mutation bumps a single shared generation counter, and every cached read
// key embeds the current generation. A write doesn't need to know which
// keys to evict: it just bumps the counter, and every previously cached
// response becomes unreachable (orphaned) on the next read, immediately.
// This trades a little extra cache churn (any write invalidates all reads,
// not just the affected slice) for invalidation that's simple and always
// correct — the right call at this site's scale.

const GENERATION_KEY = "v2:cachegen"
const MIN_TTL_SECONDS = 60

// The generation counter was read from KV on every cached read (via cacheKey)
// AND again inside bumpCacheGeneration on every write. Memoize it per isolate
// for a few seconds so a burst of requests on one isolate shares a single KV
// read. Workers keeps module state alive across requests on the same isolate,
// so this is safe; the cost is that a write's invalidation can take up to this
// long to be seen by *other* isolates, which is well under the 60s floor the
// cache entries already live by.
const GENERATION_MEMO_MS = 5_000
let memoizedGeneration: { value: number; readAt: number } | null = null

export async function getCacheGeneration(kv: KVNamespace): Promise<number> {
  const now = Date.now()
  if (memoizedGeneration && now - memoizedGeneration.readAt < GENERATION_MEMO_MS) {
    return memoizedGeneration.value
  }

  try {
    const raw = await kv.get(GENERATION_KEY)
    const value = raw ? Number(raw) || 0 : 0
    memoizedGeneration = { value, readAt: now }
    return value
  } catch (error) {
    // Keep serving the last known generation on a KV read failure rather than
    // snapping to 0, which would momentarily resurrect a whole generation of
    // orphaned entries.
    console.error("Failed to read cache generation:", error)
    return memoizedGeneration?.value ?? 0
  }
}

export async function bumpCacheGeneration(kv: KVNamespace): Promise<void> {
  try {
    const current = await getCacheGeneration(kv)
    const next = current + 1
    await kv.put(GENERATION_KEY, String(next))
    // Reflect our own bump immediately so this isolate reads the new
    // generation for the rest of the request instead of a memoized stale one.
    memoizedGeneration = { value: next, readAt: Date.now() }
  } catch (error) {
    // A failed bump only means some cached reads stay live until their TTL
    // (at most 60s) instead of being orphaned immediately. That is far
    // better than letting a KV outage or quota exhaustion turn a mutation
    // into a 500.
    console.error("Failed to bump cache generation:", error)
  }
}

export async function cacheKey(kv: KVNamespace, ...parts: Array<string | number>): Promise<string> {
  const generation = await getCacheGeneration(kv)
  return ["v2", "cache", generation, ...parts].join(":")
}

// Fetches `key` from KV; on a miss, runs `compute`, stores the result, and
// returns it. `ttlSeconds` is clamped up to KV's 60s platform minimum.
export async function readThroughCache<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<{ value: T; hit: boolean }> {
  // Caching is best-effort: a KV read or write failure (outage, quota) must
  // degrade to an uncached response, never surface as a 500. Without this,
  // every cache miss threw once KV writes started failing — see F-02, where
  // unbounded cache-key amplification is what pushes KV to that point.
  let cached: T | null = null
  try {
    cached = await kv.get<T>(key, "json")
  } catch (error) {
    console.error("Cache read failed:", error)
  }
  if (cached !== null) {
    return { value: cached, hit: true }
  }

  const value = await compute()
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(MIN_TTL_SECONDS, ttlSeconds) })
  } catch (error) {
    console.error("Cache write failed:", error)
  }
  return { value, hit: false }
}
