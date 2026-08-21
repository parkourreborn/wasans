import { insertAuditLog } from "@/lib/server/audit"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"

export const POST = withV2Context(async (ctx) => {
  const actor = await requireV2Owner(ctx)

  const duplicates = await ctx.db.prepare(
    `SELECT uuid
     FROM (
       SELECT uuid,
              ROW_NUMBER() OVER (
                PARTITION BY player_uuid, trial_name, time
                ORDER BY date DESC, uuid DESC
              ) AS row_num
       FROM submissions
     ) ranked
     WHERE ranked.row_num > 1`
  ).all<{ uuid: string }>()

  const duplicateUuids = (duplicates.results || []).map((row) => row.uuid)
  if (duplicateUuids.length === 0) {
    return jsonOk({ deletedCount: 0, deletedSubmissions: [] }, { requestId: ctx.requestId })
  }

  // wrs/pbs rows for these submissions are removed automatically by
  // ON DELETE CASCADE (see migrations/0004_schema_rebuild.sql).
  const placeholders = duplicateUuids.map(() => "?").join(",")
  await ctx.db.prepare(`DELETE FROM submissions WHERE uuid IN (${placeholders})`).bind(...duplicateUuids).run()

  for (const uuid of duplicateUuids) {
    await insertAuditLog(ctx.db, "submission_deleted", "submission", uuid, {
      actor,
      details: { reason: "duplicate_removal" },
    })
  }

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({
    deletedCount: duplicateUuids.length,
    deletedSubmissions: duplicateUuids,
  }, { requestId: ctx.requestId })
})
