import { attachmentDisposition } from "@/lib/server/r2-presign"
import { jsonError, validationError } from "@/lib/server/http"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { listArchivedFiles } from "@/lib/server/services/wr-archive-service"
import { getJwtSecret, jsonOk, withV2Context } from "@/lib/server/v2/http"
import { signValue, verifyValue } from "@/lib/server/v2/jwt"
import { formatBytes } from "@/lib/archive-filters"
import { archiveExtension, archiveZipPath } from "@/lib/wr-archive"
import { ZIP_MAX_BYTES, ZIP_MAX_FILES, zipEntryName, zipLength, zipStream, type ZipEntry } from "@/lib/zip"

// Public: several archived world records in one zip, a folder per trial.
// Two steps, so a problem shows up on the archive page instead of as a
// broken download: POST checks the picked files and signs a link for them,
// then the browser downloads that link (GET), which streams the zip.

const PURPOSE = "archive-zip"
const LINK_SECONDS = 10 * 60
const UUID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/
// R2 heads at once while checking the files.
const HEAD_BATCH = 25

type Picked = Array<[uuid: string, extension: string | null]>

function zipName(files: ReadonlyArray<{ trial_name: string }>) {
  const trials = new Set(files.map((file) => file.trial_name))
  const count = `${files.length} ${files.length === 1 ? "file" : "files"}`
  return trials.size === 1 ? `${files[0].trial_name} WR archive (${count}).zip` : `WR archive (${count}).zip`
}

export const POST = withV2Context(async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as { uuids?: unknown } | null
  const uuids = Array.isArray(body?.uuids) ? [...new Set(body.uuids)] : []
  if (uuids.length === 0 || !uuids.every((uuid): uuid is string => typeof uuid === "string" && UUID_PATTERN.test(uuid))) {
    return validationError("Pick the files to download", ctx.requestId)
  }
  if (uuids.length > ZIP_MAX_FILES) {
    return validationError(`Up to ${ZIP_MAX_FILES} files fit in one zip`, ctx.requestId)
  }
  if (!ctx.env.UPLOADS) {
    return jsonError("Video storage isn't configured", 500, { code: "internal_error", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:archive:zip", ctx.auth?.uuid), { limit: 10, windowSeconds: 10 * 60 })
  if (!rate.allowed) {
    return jsonError("Too many zips in a short time. Try again in a few minutes.", 429, { code: "rate_limited", requestId: ctx.requestId })
  }

  const files = await listArchivedFiles(ctx.db, uuids)
  const size = files.reduce((sum, file) => sum + file.size, 0)
  if (size > ZIP_MAX_BYTES) {
    return validationError(`That's ${formatBytes(size)}. One zip holds up to ${formatBytes(ZIP_MAX_BYTES)}, so pick fewer files.`, ctx.requestId)
  }

  // The file's type gives the extension in the zip, and a head also
  // confirms the file is there and the size it's listed at.
  const picked: Picked = []
  for (let index = 0; index < files.length; index += HEAD_BATCH) {
    const batch = files.slice(index, index + HEAD_BATCH)
    const heads = await Promise.all(batch.map((file) => ctx.env.UPLOADS.head(file.key)))
    batch.forEach((file, offset) => {
      const head = heads[offset]
      if (head && head.size === file.size) picked.push([file.uuid, archiveExtension(head.httpMetadata?.contentType)])
    })
  }
  if (picked.length < uuids.length) {
    const missing = uuids.length - picked.length
    return jsonError(
      `${missing} of these ${missing === 1 ? "file isn't" : "files aren't"} in the archive any more. Reload the page and try again.`,
      404,
      { code: "not_found", requestId: ctx.requestId }
    )
  }

  const token = await signValue(PURPOSE, picked, getJwtSecret(ctx.env), LINK_SECONDS)
  return jsonOk({ url: `/v2/archive/zip?token=${encodeURIComponent(token)}`, files: picked.length, size, name: zipName(files) }, { requestId: ctx.requestId })
})

function isPicked(value: unknown): value is Picked {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= ZIP_MAX_FILES &&
    value.every(
      (item) => Array.isArray(item) && typeof item[0] === "string" && UUID_PATTERN.test(item[0]) && (item[1] === null || (typeof item[1] === "string" && /^[a-z0-9]{1,5}$/.test(item[1])))
    )
  )
}

export const GET = withV2Context(async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get("token") ?? ""
  const picked = await verifyValue(PURPOSE, token, getJwtSecret(ctx.env))
  if (!isPicked(picked)) {
    return jsonError("This download link has expired. Start the download again from the archive.", 410, { code: "not_found", requestId: ctx.requestId })
  }
  if (!ctx.env.UPLOADS) {
    return jsonError("Video storage isn't configured", 500, { code: "internal_error", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:archive:zip-download", ctx.auth?.uuid), { limit: 20, windowSeconds: 10 * 60 })
  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, { code: "rate_limited", requestId: ctx.requestId })
  }

  // Looked up again rather than trusted from the link: a record denied in
  // the meantime has left the archive.
  const extensions = new Map(picked)
  const files = await listArchivedFiles(ctx.db, [...extensions.keys()])
  if (files.length < picked.length) {
    return jsonError("Some of these files aren't in the archive any more", 404, { code: "not_found", requestId: ctx.requestId })
  }

  const uploads = ctx.env.UPLOADS
  const entries: ZipEntry[] = files.map((file) => ({
    name: zipEntryName(archiveZipPath(file.key, extensions.get(file.uuid) ?? null)),
    size: file.size,
    modified: new Date(file.date * 1000),
    open: async () => (await uploads.get(file.key))?.body ?? null,
  }))

  const headers = {
    "content-type": "application/zip",
    "content-disposition": attachmentDisposition(zipName(files)),
    "cache-control": "no-store",
  }
  // A known length lets the browser show how far along the download is.
  const length = zipLength(entries)
  if (typeof FixedLengthStream === "undefined") {
    return new Response(zipStream(entries), { headers })
  }
  const { readable, writable } = new FixedLengthStream(length)
  zipStream(entries)
    .pipeTo(writable)
    .catch((error) => console.error("Archive zip failed:", error))
  return new Response(readable, { headers })
})
