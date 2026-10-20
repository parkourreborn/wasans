import { jsonError, validationError } from "@/lib/server/http"
import { handleVideoResult } from "@/lib/server/services/video-processing-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { isAuthorizedVideoCallback } from "@/lib/server/video-callback"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

// Called by the wasans-video Worker (video-worker/src/processing.js) when a
// submission's video has finished processing, successfully or not.
export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isAuthorizedVideoCallback(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const payload = await ctx.request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return validationError("Invalid result", ctx.requestId)
  }

  const result = await handleVideoResult(ctx.db, ctx.env, ctx.ctx, uuid, payload)
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
