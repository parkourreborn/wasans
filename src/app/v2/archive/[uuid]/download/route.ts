import { jsonError, validationError } from "@/lib/server/http"
import { presignOriginalGet } from "@/lib/server/r2-presign"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { getWorldRecordRun } from "@/lib/server/services/wr-archive-service"
import { withV2Params } from "@/lib/server/v2/http"
import { archiveDownloadName, isArchiveKey } from "@/lib/wr-archive"

// Public: a world record's archived original, exactly as it was submitted.
// Redirects to a presigned link that's good for 5 minutes. Only what
// /v2/archive lists: every other run's original stays moderator-only
// (/v2/submissions/[uuid]/original).
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:archive:download", ctx.auth?.uuid), {
    limit: 30,
    windowSeconds: 60,
  })
  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, { code: "rate_limited", requestId: ctx.requestId })
  }

  // Only while the run is still in a trial's record chain: a record denied
  // afterwards keeps its file privately but leaves the archive.
  const record = await getWorldRecordRun(ctx.db, uuid)
  const key = record?.original_key
  const object = isArchiveKey(key) && ctx.env.UPLOADS ? await ctx.env.UPLOADS.head(key) : null
  if (!object || !isArchiveKey(key)) {
    return jsonError("That file isn't in the archive", 404, { code: "not_found", requestId: ctx.requestId })
  }

  const url = await presignOriginalGet(ctx.env, {
    key,
    filename: archiveDownloadName(key.slice(key.lastIndexOf("/") + 1), object.httpMetadata?.contentType),
    ttlSeconds: 5 * 60,
  })
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } })
})
