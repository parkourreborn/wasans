import { getLastRuns, getVideoHealth, listAllFeatureFlags } from "@/lib/server/repositories/admin-repository"
import { getBackfillStats } from "@/lib/server/repositories/video-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

const MAINTENANCE_ACTIONS = ["scores_recalculated", "duplicates_removed", "analytics_backfilled", "video_backfill_started"] as const

// The admin Site page: every switch (defaults included), video processing
// health, and when each maintenance tool last ran.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const now = Math.floor(Date.now() / 1000)
  const [flags, video, backfill, lastRuns] = await Promise.all([
    listAllFeatureFlags(ctx.db),
    getVideoHealth(ctx.db, now),
    getBackfillStats(ctx.db, now),
    getLastRuns(ctx.db, MAINTENANCE_ACTIONS),
  ])
  return jsonOk({ flags, video, backfill, last_runs: lastRuns }, { requestId: ctx.requestId })
})
