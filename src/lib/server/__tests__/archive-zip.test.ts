import test from "node:test"
import assert from "node:assert/strict"
import { crc32, zipEntryName, zipLength, zipStream, type ZipEntry } from "@/lib/zip"

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const parts: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

// Reads a zip back the way an unzipper does: from the central directory.
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files: Array<{ name: string; crc: number; text: string; date: number; time: number }> = []
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    assert.equal(view.getUint32(offset, true), 0x04034b50)
    const dataStart = offset + 30 + view.getUint16(offset + 26, true)
    const data = bytes.subarray(dataStart, dataStart + size)
    assert.equal(crc32(0, data), crc, `${name} crc`)
    assert.equal(view.getUint32(dataStart + size, true), 0x08074b50, `${name} descriptor`)
    files.push({ name, crc, text: new TextDecoder().decode(data), date: view.getUint16(at + 14, true), time: view.getUint16(at + 12, true) })
    at += 46 + nameLength
  }
  return files
}

test("crc32 matches the standard check value, in one go or in pieces", () => {
  const bytes = new TextEncoder().encode("123456789")
  assert.equal(crc32(0, bytes), 0xcbf43926)
  assert.equal(crc32(crc32(0, bytes.subarray(0, 4)), bytes.subarray(4)), 0xcbf43926)
  const long = new Uint8Array(1000).map((_, index) => (index * 31) & 0xff)
  assert.equal(crc32(crc32(0, long.subarray(0, 333)), long.subarray(333)), crc32(0, long))
})

test("a zip holds every file under its folder, and is exactly as long as promised", async () => {
  const entries: ZipEntry[] = [
    { name: "Neon Bold/Tully (p1) 45.600 (1.2).mp4", size: 11, modified: new Date(Date.UTC(2024, 2, 5, 13, 7, 9)), open: async () => streamOf("hello", " world") },
    { name: "Glass/Ana ü (p2) 9.000 (no version)", size: 0, modified: new Date(Date.UTC(1970, 0, 1)), open: async () => streamOf() },
  ]
  const bytes = await collect(zipStream(entries))
  assert.equal(bytes.length, zipLength(entries))

  const files = readZip(bytes)
  assert.deepEqual(files.map((file) => [file.name, file.text]), [
    ["Neon Bold/Tully (p1) 45.600 (1.2).mp4", "hello world"],
    ["Glass/Ana ü (p2) 9.000 (no version)", ""],
  ])
  // 2024-03-05 13:07:08 in MS-DOS form; before 1980 clamps to 1980.
  assert.equal(files[0].date, ((2024 - 1980) << 9) | (3 << 5) | 5)
  assert.equal(files[0].time, (13 << 11) | (7 << 5) | 4)
  assert.equal(files[1].date >> 9, 0)
})

test("a file that isn't the size it was listed at fails the zip instead of corrupting it", async () => {
  const short: ZipEntry[] = [{ name: "a", size: 10, modified: new Date(), open: async () => streamOf("abc") }]
  await assert.rejects(collect(zipStream(short)), /shorter/)
  const long: ZipEntry[] = [{ name: "a", size: 2, modified: new Date(), open: async () => streamOf("abc") }]
  await assert.rejects(collect(zipStream(long)), /longer/)
  const missing: ZipEntry[] = [{ name: "a", size: 2, modified: new Date(), open: async () => null }]
  await assert.rejects(collect(zipStream(missing)), /missing/)
})

test("zip entry names lose the characters Windows won't extract", () => {
  assert.equal(zipEntryName('Glass/a:b*c?"d<e>|f.mp4'), "Glass/a-b-c--d-e--f.mp4")
  assert.equal(zipEntryName("Thread/ "), "Thread/-")
})
