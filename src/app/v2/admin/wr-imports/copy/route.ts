import { isDriveConfigured, queueDriveCopies } from "@/lib/server/services/wr-import-service"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Puts the files whose copy failed back in line and queues the next copies.
// The video container downloads each one from the Drive itself, so this
// returns straight away; the queue page checks back for progress.
export const POST = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  if (!isDriveConfigured(ctx.env)) {
    throw new ApiError("Reading the Drive needs a Google API key: add it as the GOOGLE_DRIVE_API_KEY secret", 500, "internal_error")
  }
  if (!ctx.env.VIDEO_QUEUE) {
    throw new ApiError("The video processing queue isn't configured", 500, "internal_error")
  }

  const result = await queueDriveCopies(ctx.env, ctx.db, { retryFailed: true })
  return jsonOk(result, { requestId: ctx.requestId })
})
