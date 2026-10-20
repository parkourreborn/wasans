import { insertAuditLog } from "@/lib/server/audit"
import { listGameVersions } from "@/lib/server/repositories/game-version-repository"
import { archiveWorldRecords, isArchived, listWorldRecordRuns } from "@/lib/server/services/wr-archive-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { archiveFileName } from "@/lib/wr-archive"

// The admin WR versions queue: every run that was ever a world record, with
// its version and whether its file is archived under its name yet.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  const [runs, versions] = await Promise.all([listWorldRecordRuns(ctx.db), listGameVersions(ctx.db)])
  return jsonOk(
    {
      versions,
      runs: runs.map((run) => ({
        uuid: run.uuid,
        trial_name: run.trial_name,
        player_uuid: run.player_uuid,
        player_name: run.player_name,
        time: Number(run.time),
        date: Number(run.date),
        game_version: run.game_version,
        current: Boolean(run.is_current_wr),
        file_name: archiveFileName(run),
        archived: isArchived(run),
        source: run.original_source,
      })),
    },
    { requestId: ctx.requestId }
  )
})

// Archives the next batch now instead of waiting for the daily sweep.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  if (!ctx.env.UPLOADS || !ctx.env.SUBMISSION_VIDEOS) {
    throw new ApiError("Video storage isn't configured", 500, "internal_error")
  }

  const result = await archiveWorldRecords(ctx.env, ctx.db, { limit: 10, budgetMs: 60 * 1000 })
  await insertAuditLog(ctx.db, "wr_originals_archived", "maintenance", null, { actor: user, details: result })
  if (result.archived > 0) {
    await bumpCacheGeneration(ctx.cache)
  }

  return jsonOk(result, { requestId: ctx.requestId })
})
