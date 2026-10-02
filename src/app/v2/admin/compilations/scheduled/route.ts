import { jsonError } from "@/lib/server/http"
import { secretsMatch } from "@/lib/constant-time"
import { startCompilation } from "@/lib/server/services/compilation-service"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called at 00:00 UTC on the 1st of every month by the standalone
// cron-worker (see cron-worker/ at the repo root) -- same auth pattern as
// /v2/admin/trials/sweep. Renders the WRs standing at the end of the month
// that just ended.
function isAuthorizedCronRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return secretsMatch(provided, String(env.CRON_SECRET || ""))
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedCronRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const result = await startCompilation(ctx.db, ctx.env, { trigger: "scheduled" })
  return jsonOk(result, { status: 202, requestId: ctx.requestId })
})
