import { jsonError } from "@/lib/server/http"
import { secretsMatch } from "@/lib/constant-time"
import { cleanupExpiredApiState } from "@/lib/server/services/api-state-cleanup-service"
import { sweepVideoProcessing } from "@/lib/server/services/video-processing-service"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called once a day by the same standalone Cloudflare Cron Trigger worker
// that runs the trial sweep (see cron-worker/ at the repo root). Deletes
// expired idempotency keys and stale rate-limit buckets, which used to be
// swept inline on every request instead, and sweeps video processing.
function isAuthorizedCleanupRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return secretsMatch(provided, String(env.CRON_SECRET || ""))
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedCleanupRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const result = await cleanupExpiredApiState(ctx.db)
  // Re-queues submission videos whose processing job got lost, and keeps a
  // started backfill moving (see video-processing-service.ts).
  const videos = await sweepVideoProcessing(ctx.db, ctx.env)

  return jsonOk({ ok: true, ...result, ...videos }, { requestId: ctx.requestId })
})
