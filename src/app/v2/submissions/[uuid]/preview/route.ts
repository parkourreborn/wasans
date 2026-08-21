import { jsonError, validationError } from "@/lib/server/http"
import { canModerate, loadAuthUserByUuid } from "@/lib/server/auth"
import { getSubmissionBase } from "@/lib/server/repositories/submission-repository"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

const scorePreviewContentType = "image/jpeg"
const maxPreviewBytes = 2 * 1024 * 1024

function isValidSubmissionUuid(uuid: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(uuid)
}

// Video-file submissions already get their poster frame captured client-side
// at upload time (see submissions/new). Medal-link submissions have their
// video fetched server-side instead, so there's no local <video> element to
// grab a frame from during that request — the client re-fetches the
// now-hosted video right after the submission is created and PUTs the
// captured frame here instead.
export const PUT = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  if (!ctx.auth) {
    return jsonError("Authentication is required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    return jsonError("Authentication is required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const submission = await getSubmissionBase(ctx.db, uuid)
  if (!submission) {
    return jsonError("Submission was not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  if (submission.player_uuid !== user.uuid && !canModerate(user)) {
    return jsonError("You can only set a preview for your own submission", 403, { code: "forbidden", requestId: ctx.requestId })
  }

  const writeRate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:submissions:preview", user.uuid), {
    limit: 20,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: { "retry-after": String(writeRate.retryAfter) },
    })
  }

  if (!ctx.env.SUBMISSION_VIDEOS) {
    return jsonError("Submission video bucket is not available", 500, { code: "internal_error", requestId: ctx.requestId })
  }

  const contentType = ctx.request.headers.get("content-type") || ""
  if (!contentType.startsWith("image/jpeg")) {
    return validationError("Preview must be a JPEG image", ctx.requestId)
  }

  const body = await ctx.request.arrayBuffer()
  if (body.byteLength === 0) {
    return validationError("Preview image is empty", ctx.requestId)
  }
  if (body.byteLength > maxPreviewBytes) {
    return validationError("Preview image is too large", ctx.requestId)
  }

  await ctx.env.SUBMISSION_VIDEOS.put(`scores/${uuid}-preview.jpg`, body, {
    httpMetadata: { contentType: scorePreviewContentType },
  })

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
