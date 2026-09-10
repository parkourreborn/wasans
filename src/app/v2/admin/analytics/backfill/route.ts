import { backfillScoreHistory } from "@/lib/server/analytics/backfill"
import { snapshotPlayerRanks } from "@/lib/server/analytics/rank-snapshot"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Owner-triggered, one-time (but safe to re-run) reconstruction of score
// history from existing submissions -- see backfillScoreHistory for the
// algorithm and its documented approximations. Also takes today's rank
// snapshot immediately, so the rank-over-time chart isn't empty until the
// next daily cron run.
export const POST = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const result = await backfillScoreHistory(ctx.db)
  await snapshotPlayerRanks(ctx.db)

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
