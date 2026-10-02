// Helpers shared by render.mjs (WR compilation) and process.mjs
// (submission video processing).

import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { open, stat } from "node:fs/promises"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

// R2 requires every multipart part except the last to be the same size,
// and at least 5 MiB.
const UPLOAD_PART_BYTES = 16 * 1024 * 1024

export function readJob() {
  const raw = process.env.JOB_JSON
  if (!raw) {
    throw new Error("JOB_JSON is not set")
  }

  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
}

export function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
      // ffmpeg is chatty; only the tail matters for an error message.
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`))
      }
    })
  })
}

// Streams a response body to disk, failing as soon as more than maxBytes
// arrive (a declared Content-Length can't be trusted on its own).
export async function saveResponse(response, destination, maxBytes = Infinity) {
  if (!response.body) {
    throw new Error("response has no body")
  }

  let received = 0
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length
      if (received > maxBytes) {
        callback(new SizeLimitError(maxBytes))
        return
      }
      callback(null, chunk)
    },
  })

  await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(destination))
  return received
}

export class SizeLimitError extends Error {
  constructor(maxBytes) {
    super(`video is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`)
    this.name = "SizeLimitError"
  }
}

async function checked(response, what) {
  if (!response.ok) {
    throw new Error(`${what} failed (${response.status}): ${await response.text().catch(() => "")}`)
  }
  return response
}

// Multipart upload through a Worker outbound handler that exposes
// {base}/create, {base}/part, {base}/complete and {base}/abort. The handler
// decides the object key; the container never names it.
export async function uploadMultipart(base, file, metadata) {
  const { size } = await stat(file)
  const created = await checked(
    await fetch(`${base}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata),
    }),
    "multipart create"
  )
  const { uploadId } = await created.json()
  const query = (extra = {}) => new URLSearchParams({ uploadId, ...extra }).toString()

  try {
    const parts = []
    const handle = await open(file, "r")
    try {
      for (let offset = 0, partNumber = 1; offset < size; offset += UPLOAD_PART_BYTES, partNumber += 1) {
        const length = Math.min(UPLOAD_PART_BYTES, size - offset)
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, offset)

        const response = await checked(
          await fetch(`${base}/part?${query({ partNumber: String(partNumber) })}`, {
            method: "PUT",
            headers: { "content-length": String(length) },
            body: buffer,
          }),
          `multipart part ${partNumber}`
        )
        parts.push(await response.json())
      }
    } finally {
      await handle.close()
    }

    await checked(
      await fetch(`${base}/complete?${query()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts }),
      }),
      "multipart complete"
    )
  } catch (error) {
    await fetch(`${base}/abort?${query()}`, { method: "POST" }).catch(() => {})
    throw error
  }

  return size
}
