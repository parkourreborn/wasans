// Regression guard for F-02 (fixed on this branch). Two properties:
//
//  1. readThroughCache is best-effort — a failing KV write (quota/outage) now
//     degrades to an uncached response instead of throwing a 500. Before the
//     fix this threw, which is what turned cache-key amplification into a DoS.
//  2. The raw helper still writes one entry per distinct key. That is exactly
//     why the list routes must NOT pass free-text search terms through it:
//     after the fix, GET /v2/submissions and /v2/combo-submissions bypass the
//     cache entirely when a search param is present (see those routes), and a
//     per-IP enforcePublicReadLimit caps the request volume on top.
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

test("a failing KV write degrades to an uncached response instead of throwing", async () => {
  const kv = new FakeKV()
  kv.failPutsAfter = 0
  const key = await cacheKey(kv as unknown as KVNamespace, "x")
  let computed = 0
  const result = await readThroughCache(kv as unknown as KVNamespace, key, 60, async () => {
    computed += 1
    return { ok: true }
  })
  assert.deepEqual(result, { value: { ok: true }, hit: false })
  assert.equal(computed, 1)
})

test("the helper writes one entry per distinct key (why routes must not cache free-text)", async () => {
  const kv = new FakeKV()
  for (let i = 0; i < 50; i++) {
    const key = await cacheKey(kv as unknown as KVNamespace, "list", `term-${i}`)
    await readThroughCache(kv as unknown as KVNamespace, key, 60, async () => ({ i }))
  }
  assert.equal(kv.puts, 50)
})
