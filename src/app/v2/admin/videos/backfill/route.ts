import { insertAuditLog } from "@/lib/server/audit"
import { continueBackfill, getVideoBackfillStatus } from "@/lib/server/services/video-processing-service"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Runs every video that predates server-side processing through the same
// pipeline as new uploads (re-encoded only if it isn't already a compliant
// H.264 MP4; thumbnail regenerated either way). A few at a time: each one
// that finishes starts the next, and the daily maintenance sweep picks it
// back up if that chain ever breaks.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  return jsonOk(await getVideoBackfillStatus(ctx.db), { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const result = await continueBackfill(ctx.db, ctx.env, { start: true })
  if (result.started > 0) {
    await insertAuditLog(ctx.db, "video_backfill_started", "video_backfill", null, {
      actor: user,
      details: { started: result.started },
    })
  }

  return jsonOk({ ...result, ...(await getVideoBackfillStatus(ctx.db)) }, { requestId: ctx.requestId })
})
