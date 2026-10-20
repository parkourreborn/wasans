import { copyDriveFiles, isDriveConfigured } from "@/lib/server/services/wr-import-service"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Copies the next few files from the Drive into the uploads bucket. The
// queue page calls this again and again while it's open until none are
// left; the daily sweep does a batch too.
export const POST = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  if (!isDriveConfigured(ctx.env)) {
    throw new ApiError("Reading the Drive needs a Google API key: add it as the GOOGLE_DRIVE_API_KEY secret", 500, "internal_error")
  }
  if (!ctx.env.UPLOADS) {
    throw new ApiError("Video storage isn't configured", 500, "internal_error")
  }

  const result = await copyDriveFiles(ctx.env, ctx.db, { limit: 20, budgetMs: 40 * 1000 })
  return jsonOk(result, { requestId: ctx.requestId })
})
