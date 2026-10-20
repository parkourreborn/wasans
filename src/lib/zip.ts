// A streaming zip writer for the WR archive's multi-file download. Files are
// stored as they are (videos don't compress), so the zip's exact length is
// known before the first byte and the CRC is the only thing worked out on
// the way through. No DB, no "server-only", so the tests can use it.
//
// Plain zip, not zip64: every offset and size has to fit in 32 bits, which
// is what ZIP_MAX_BYTES leaves room for.

export const ZIP_MAX_BYTES = 4_000_000_000
export const ZIP_MAX_FILES = 250

const LOCAL_HEADER = 30
const DATA_DESCRIPTOR = 16
const CENTRAL_HEADER = 46
const END_OF_CENTRAL_DIRECTORY = 22

// Bit 3: sizes and CRC follow the data. Bit 11: names are UTF-8.
const FLAGS = 0x0808
const VERSION = 20

// Slice-by-8: eight bytes per step, several times faster than a byte at a
// time, which matters for gigabytes on a Worker's CPU budget.
const TABLES = (() => {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(256))
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tables[0][n] = c >>> 0
  }
  for (let n = 0; n < 256; n += 1) {
    for (let t = 1; t < 8; t += 1) tables[t][n] = (tables[t - 1][n] >>> 8) ^ tables[0][tables[t - 1][n] & 0xff]
  }
  return tables
})()

// Carries on from `crc` (0 to start).
export function crc32(crc: number, bytes: Uint8Array) {
  const [t0, t1, t2, t3, t4, t5, t6, t7] = TABLES
  let c = ~crc >>> 0
  let i = 0
  for (const end = bytes.length - 8; i <= end; i += 8) {
    const a = (c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24))) >>> 0
    c = t7[a & 0xff] ^ t6[(a >>> 8) & 0xff] ^ t5[(a >>> 16) & 0xff] ^ t4[a >>> 24] ^ t3[bytes[i + 4]] ^ t2[bytes[i + 5]] ^ t1[bytes[i + 6]] ^ t0[bytes[i + 7]]
  }
  for (; i < bytes.length; i += 1) c = t0[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

export type ZipEntry = {
  // A path inside the zip, folders separated by "/".
  name: string
  size: number
  modified: Date
  // The file's bytes, exactly `size` of them.
  open: () => Promise<ReadableStream<Uint8Array> | null>
}

const encoder = new TextEncoder()

// Characters Windows refuses in a file name.
export function zipEntryName(path: string) {
  return path
    .split("/")
    .map((part) => part.replace(/[\u0000-\u001f<>:"\\|?*]/g, "-").trim() || "-")
    .join("/")
}

// The zip's length in bytes for these files.
export function zipLength(entries: ReadonlyArray<Pick<ZipEntry, "name" | "size">>) {
  let length = END_OF_CENTRAL_DIRECTORY
  for (const entry of entries) {
    const name = encoder.encode(entry.name).length
    length += LOCAL_HEADER + name + entry.size + DATA_DESCRIPTOR + CENTRAL_HEADER + name
  }
  return length
}

// MS-DOS time, which is what zip keeps: two-second steps, 1980 at the
// earliest. In UTC, since there's no telling the downloader's time zone.
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear())
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  }
}

function localHeader(name: Uint8Array, stamp: { time: number; date: number }) {
  const bytes = new Uint8Array(LOCAL_HEADER + name.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, VERSION, true)
  view.setUint16(6, FLAGS, true)
  view.setUint16(8, 0, true) // stored
  view.setUint16(10, stamp.time, true)
  view.setUint16(12, stamp.date, true)
  // CRC and sizes (14-25) stay zero: they're in the data descriptor.
  view.setUint16(26, name.length, true)
  view.setUint16(28, 0, true)
  bytes.set(name, LOCAL_HEADER)
  return bytes
}

function dataDescriptor(crc: number, size: number) {
  const bytes = new Uint8Array(DATA_DESCRIPTOR)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x08074b50, true)
  view.setUint32(4, crc, true)
  view.setUint32(8, size, true)
  view.setUint32(12, size, true)
  return bytes
}

type Written = { name: Uint8Array; stamp: { time: number; date: number }; crc: number; size: number; offset: number }

function centralHeader(file: Written) {
  const bytes = new Uint8Array(CENTRAL_HEADER + file.name.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, VERSION, true)
  view.setUint16(6, VERSION, true)
  view.setUint16(8, FLAGS, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, file.stamp.time, true)
  view.setUint16(14, file.stamp.date, true)
  view.setUint32(16, file.crc, true)
  view.setUint32(20, file.size, true)
  view.setUint32(24, file.size, true)
  view.setUint16(28, file.name.length, true)
  // Extra field, comment, disk, attributes (30-41) stay zero.
  view.setUint32(42, file.offset, true)
  bytes.set(file.name, CENTRAL_HEADER)
  return bytes
}

function endOfCentralDirectory(count: number, size: number, offset: number) {
  const bytes = new Uint8Array(END_OF_CENTRAL_DIRECTORY)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, count, true)
  view.setUint16(10, count, true)
  view.setUint32(12, size, true)
  view.setUint32(16, offset, true)
  return bytes
}

async function* zipChunks(entries: readonly ZipEntry[]): AsyncGenerator<Uint8Array> {
  const written: Written[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const stamp = dosDateTime(entry.modified)
    const header = localHeader(name, stamp)
    const start = offset
    yield header
    offset += header.length

    const stream = await entry.open()
    if (!stream) throw new Error(`${entry.name} is missing`)
    const reader = stream.getReader()
    let crc = 0
    let size = 0
    let finished = false
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        crc = crc32(crc, value)
        size += value.length
        if (size > entry.size) throw new Error(`${entry.name} is longer than expected`)
        yield value
      }
      finished = true
    } finally {
      // Stopped partway (the download was cancelled, or it failed): let go
      // of the file instead of leaving it open.
      if (finished) reader.releaseLock()
      else await reader.cancel().catch(() => {})
    }
    // The length was promised up front, so a short file can't be papered over.
    if (size !== entry.size) throw new Error(`${entry.name} is shorter than expected`)

    const descriptor = dataDescriptor(crc, size)
    yield descriptor
    offset += size + descriptor.length
    written.push({ name, stamp, crc, size, offset: start })
  }

  const centralStart = offset
  for (const file of written) {
    const header = centralHeader(file)
    yield header
    offset += header.length
  }
  yield endOfCentralDirectory(written.length, offset - centralStart, centralStart)
}

// Opens each file only when the zip gets to it, so one stream is open at a
// time however many files there are.
export function zipStream(entries: readonly ZipEntry[]): ReadableStream<Uint8Array> {
  if (entries.length > 0xffff) throw new Error("Too many files for one zip")
  if (zipLength(entries) > 0xffffffff) throw new Error("Too big for one zip")
  const chunks = zipChunks(entries)
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })
}
