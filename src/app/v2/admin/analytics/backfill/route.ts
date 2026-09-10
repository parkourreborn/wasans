import { backfillScoreHistory } from "@/lib/server/analytics/backfill"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Owner-triggered, one-time (but safe to re-run) reconstruction of score
// history and daily rank snapshots from existing submissions -- see
// backfillScoreHistory for the algorithm and its documented approximations.
export const POST = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const result = await backfillScoreHistory(ctx.db)

  return jsonOk({ ok: true, ...result }, { requestId: ctx.requestId })
})
