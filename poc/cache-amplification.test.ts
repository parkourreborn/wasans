// PoC (local only): public list endpoints build their KV cache key from raw
// query parameters (e.g. ?search=), with no rate limit. Every distinct value
// is a cache miss: one D1 query plus one KV write per anonymous request.
// readThroughCache awaits kv.put with no try/catch, so once KV writes start
// failing (the free plan allows 1,000/day) every cache miss on the site
// becomes a 500.
//
// Run: node --conditions=react-server --import tsx --test poc/cache-amplification.test.ts
import test from "node:test"
import assert from "node:assert/strict"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"

class FakeKV {
  store = new Map<string, string>()
  puts = 0
  failPutsAfter = Infinity
  async get(key: string, type?: string) {
    const value = this.store.get(key)
    if (value === undefined) return null
    return type === "json" ? JSON.parse(value) : value
  }
  async put(key: string, value: string) {
    if (this.puts >= this.failPutsAfter) throw new Error("KV put() limit exceeded for the day")
    this.puts += 1
    this.store.set(key, value)
  }
}

// Mirrors GET /v2/combo-submissions: the search term goes straight into the key.
async function listComboSubmissions(kv: FakeKV, search: string, dbQueries: { n: number }) {
  const key = await cacheKey(kv as unknown as KVNamespace, "combo-submissions", "list", 1, 50, "-", "-", "-", search || "-", "-", "desc")
  return readThroughCache(kv as unknown as KVNamespace, key, 60, async () => {
    dbQueries.n += 1
    return { results: [], total: 0 }
  })
}

test("each unique ?search= value costs one D1 query and one KV write", async () => {
  const kv = new FakeKV()
  const db = { n: 0 }
  for (let i = 0; i < 500; i++) await listComboSubmissions(kv, `x${i}`, db)
  assert.equal(db.n, 500)
  assert.equal(kv.puts, 500)
})

test("once KV writes fail, ordinary cache misses throw (served as 500)", async () => {
  const kv = new FakeKV()
  kv.failPutsAfter = 0
  await assert.rejects(listComboSubmissions(kv, "", { n: 0 }), /limit exceeded/)
})
