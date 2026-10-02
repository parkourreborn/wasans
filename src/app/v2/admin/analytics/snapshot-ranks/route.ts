import { jsonError } from "@/lib/server/http"
import { secretsMatch } from "@/lib/constant-time"
import { snapshotPlayerRanks } from "@/lib/server/analytics/rank-snapshot"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

// Called once a day by the standalone cron-worker (see cron-worker/ at the
// repo root) -- same auth pattern as /v2/admin/trials/sweep.
function isAuthorizedCronRequest(request: Request, env: CloudflareEnv) {
  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : ""
  return secretsMatch(provided, String(env.CRON_SECRET || ""))
}

export const POST = withV2Context(async (ctx) => {
  if (!isAuthorizedCronRequest(ctx.request, ctx.env)) {
    return jsonError("Unauthorized", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const playersSnapshotted = await snapshotPlayerRanks(ctx.db)

  return jsonOk({ ok: true, players_snapshotted: playersSnapshotted }, { requestId: ctx.requestId })
})
