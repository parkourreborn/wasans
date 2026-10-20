import { jsonError, validationError } from "@/lib/server/http"
import { applyDriveEncodeResult, queueDriveEncodes } from "@/lib/server/services/wr-import-service"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"
import { isAuthorizedVideoCallback } from "@/lib/server/video-callback"
import { isDriveFileId } from "@/lib/wr-import"

// Called by the wasans-video Worker (video-worker/src/processing.js) when a
// file in the WR import queue has been re-encoded, or couldn't be. Each one
// that finishes starts the next.
export const POST = withV2Params<{ id: string }>(async (ctx, { id }) => {
  if (!isAuthorizedVideoCallback(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  if (!isDriveFileId(id)) {
    return validationError("Invalid Drive file id", ctx.requestId)
  }

  const payload = await ctx.request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return validationError("Invalid result", ctx.requestId)
  }

  const result = await applyDriveEncodeResult(ctx.env, ctx.db, id, payload)
  ctx.ctx.waitUntil(queueDriveEncodes(ctx.env, ctx.db).catch((error) => console.error("Queueing Drive re-encodes failed:", error)))

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
