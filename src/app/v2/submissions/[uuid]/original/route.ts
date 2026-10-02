import { jsonError, validationError } from "@/lib/server/http"
import { canModerate, loadAuthUserByUuid } from "@/lib/server/auth"
import { presignOriginalGet } from "@/lib/server/r2-presign"
import { insertAuditLog } from "@/lib/server/audit"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { withV2Params } from "@/lib/server/v2/http"

// The untouched file a player uploaded (or the Medal clip as downloaded),
// kept privately for 90 days so a disputed run can be checked against what
// was actually submitted rather than the processed copy. Moderators only.
// Redirects to a presigned link that's good for 5 minutes.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const user = ctx.auth ? await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request) : null
  if (!user) {
    return jsonError("Authentication is required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }
  if (!canModerate(user)) {
    return jsonError("Moderator permission is required", 403, { code: "forbidden", requestId: ctx.requestId })
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:submissions:original", user.uuid), {
    limit: 30,
    windowSeconds: 60,
  })
  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, { code: "rate_limited", requestId: ctx.requestId })
  }

  const submission = await ctx.db.prepare(
    `SELECT uuid, trial_name, time, original_key FROM submissions WHERE uuid = ?`
  )
    .bind(uuid)
    .first<{ uuid: string; trial_name: string; time: number; original_key: string | null }>()
  if (!submission) {
    return jsonError("Submission was not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  // The lifecycle rule may already have deleted it (90 days).
  const object = submission.original_key && ctx.env.UPLOADS ? await ctx.env.UPLOADS.head(submission.original_key) : null
  if (!object || !submission.original_key) {
    return jsonError("The original video is no longer available", 404, { code: "not_found", requestId: ctx.requestId })
  }

  await insertAuditLog(ctx.db, "submission_original_downloaded", "submission", uuid, {
    actor: user,
    details: { trial_name: submission.trial_name },
  })

  const url = await presignOriginalGet(ctx.env, {
    key: submission.original_key,
    filename: `${submission.trial_name} ${submission.time} original (${uuid})`,
    ttlSeconds: 5 * 60,
  })

  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } })
})
