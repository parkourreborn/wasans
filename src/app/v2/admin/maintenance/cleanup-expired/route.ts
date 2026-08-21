import { jsonError } from "@/lib/server/http"
import { cleanupExpiredApiState } from "@/lib/server/services/api-state-cleanup-service"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called once a day by the same standalone Cloudflare Cron Trigger worker
// that runs the trial sweep (see cron-worker/ at the repo root). Deletes
// expired idempotency keys and stale rate-limit buckets, which used to be
// swept inline on every request instead.
function isAuthorizedCleanupRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return Boolean(provided && env.CRON_SECRET && provided === env.CRON_SECRET)
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedCleanupRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const result = await cleanupExpiredApiState(ctx.db)

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
