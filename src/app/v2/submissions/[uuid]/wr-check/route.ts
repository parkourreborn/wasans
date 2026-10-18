import { jsonError, validationError } from "@/lib/server/http"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { jsonOk, requireV2Moderator, withV2Params } from "@/lib/server/v2/http"
import { wouldBeAnnouncedWr } from "@/lib/server/wrs"

// Whether approving this run would make it the WR, so the review queue can
// ask about the WR ping before it holds the approval for its undo window.
// The PATCH itself still refuses a WR approval that has no ping choice.
export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const user = await requireV2Moderator(ctx)

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:submissions:wr-check", user.uuid), {
    limit: 60,
    windowSeconds: 60,
  })
  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, { code: "rate_limited", requestId: ctx.requestId })
  }

  const submission = await ctx.db.prepare(`SELECT time FROM submissions WHERE uuid = ?`)
    .bind(uuid)
    .first<{ time: number }>()
  if (!submission) {
    return jsonError("Submission was not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  const wouldBeWr = await wouldBeAnnouncedWr(ctx.db, uuid, Number(submission.time))
  return jsonOk({ would_be_wr: wouldBeWr }, { requestId: ctx.requestId })
})
