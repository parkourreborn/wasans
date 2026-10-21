import { reprocessFailedImports } from "@/lib/server/services/wr-import-service"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Queues the imported runs whose video failed to process again, reading each
// one's original from the archive. Returns straight away; the queue page
// checks back for progress.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  if (!ctx.env.VIDEO_QUEUE) {
    throw new ApiError("The video processing queue isn't configured", 500, "internal_error")
  }

  const result = await reprocessFailedImports(ctx.env, ctx.db, user)
  return jsonOk(result, { requestId: ctx.requestId })
})
