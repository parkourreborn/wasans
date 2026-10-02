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

export async function getCacheGeneration(kv: KVNamespace): Promise<number> {
  const value = await kv.get(GENERATION_KEY)
  return value ? Number(value) || 0 : 0
}

export async function bumpCacheGeneration(kv: KVNamespace): Promise<void> {
  const current = await getCacheGeneration(kv)
  await kv.put(GENERATION_KEY, String(current + 1))
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
  const cached = await kv.get<T>(key, "json")
  if (cached !== null) {
    return { value: cached, hit: true }
  }

  const value = await compute()
  await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(MIN_TTL_SECONDS, ttlSeconds) })
  return { value, hit: false }
}
