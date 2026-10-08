import { insertAuditLog } from "@/lib/server/audit"
import { backfillScoreHistory } from "@/lib/server/analytics/backfill"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Owner-triggered, one-time (but safe to re-run) reconstruction of score
// history and daily rank snapshots from existing submissions -- see
// backfillScoreHistory for the algorithm and its documented approximations.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const result = await backfillScoreHistory(ctx.db)
  await insertAuditLog(ctx.db, "analytics_backfilled", "maintenance", null, { actor: user, details: result })

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
