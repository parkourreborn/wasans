import { jsonError } from "@/lib/server/http"
import { isFeatureEnabled } from "@/lib/server/repositories/feature-flag-repository"
import { getSubmissionBan } from "@/lib/server/repositories/submission-ban-repository"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { createVideoUploadUrl } from "@/lib/server/services/video-processing-service"
import { formatSubmissionBanMessage } from "@/lib/submission-bans"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Step 1 of a video submission: hands out a short-lived presigned PUT URL
// for one file, so the browser uploads straight to the private
// wasans-uploads bucket instead of through this Worker. The URL is pinned
// to one new key (incoming/{upload_id}), this file's type and exact size,
// and expires in 15 minutes. Step 2 is POST /v2/submissions with the
// upload_id, which consumes it exactly once.
export const POST = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  if (!(await isFeatureEnabled(ctx.db, "submissions_enabled"))) {
    return jsonError("Submissions are currently disabled", 403, { code: "forbidden", requestId: ctx.requestId })
  }

  const submissionBan = await getSubmissionBan(ctx.db, ctx.auth.uuid)
  if (submissionBan) {
    return jsonError(formatSubmissionBanMessage(submissionBan.reason), 403, {
      code: "forbidden",
      requestId: ctx.requestId,
      details: { banned_at: submissionBan.banned_at },
    })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:uploads:create", ctx.auth.uuid), {
    limit: 20,
    windowSeconds: 60,
  })
  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  const body = (await ctx.request.json().catch(() => null)) as { size?: unknown; content_type?: unknown; filename?: unknown } | null
  const upload = await createVideoUploadUrl(ctx.db, ctx.env, ctx.auth.uuid, body)

  return jsonOk(upload, { status: 201, requestId: ctx.requestId })
})
