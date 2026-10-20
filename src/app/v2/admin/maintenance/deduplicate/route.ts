import { buildAuditLogStatement, insertAuditLog } from "@/lib/server/audit"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { runOriginalKeys } from "@/lib/wr-archive"

export const POST = withV2Context(async (ctx) => {
  const actor = await requireV2Owner(ctx)

  const duplicates = await ctx.db.prepare(
    `SELECT uuid, original_key
     FROM (
       SELECT uuid, original_key,
              ROW_NUMBER() OVER (
                PARTITION BY player_uuid, trial_name, time
                ORDER BY date DESC, uuid DESC
              ) AS row_num
       FROM submissions
     ) ranked
     WHERE ranked.row_num > 1`
  ).all<{ uuid: string; original_key: string | null }>()

  const duplicateRows = duplicates.results || []
  const duplicateUuids = duplicateRows.map((row) => row.uuid)
  if (duplicateUuids.length === 0) {
    await insertAuditLog(ctx.db, "duplicates_removed", "maintenance", null, { actor, details: { deleted_count: 0 } })
    return jsonOk({ deletedCount: 0, deletedSubmissions: [] }, { requestId: ctx.requestId })
  }

  // wrs/pbs rows for these submissions are removed automatically by
  // ON DELETE CASCADE (see migrations/0004_schema_rebuild.sql). The delete
  // and every per-uuid audit-log insert are independent writes, so they all
  // go in one D1 batch instead of one round trip per duplicate found.
  const placeholders = duplicateUuids.map(() => "?").join(",")
  await ctx.db.batch([
    ctx.db.prepare(`DELETE FROM submissions WHERE uuid IN (${placeholders})`).bind(...duplicateUuids),
    ...duplicateUuids.map((uuid) =>
      buildAuditLogStatement(ctx.db, "submission_deleted", "submission", uuid, {
        actor,
        details: { reason: "duplicate_removal" },
      })
    ),
    buildAuditLogStatement(ctx.db, "duplicates_removed", "maintenance", null, {
      actor,
      details: { deleted_count: duplicateUuids.length },
    }),
  ])

  // Their originals too: an archived world record's would otherwise stay
  // forever. R2 deletes up to 1000 keys per call.
  if (ctx.env.UPLOADS) {
    const keys = duplicateRows.flatMap((row) => runOriginalKeys(row.uuid, row.original_key))
    for (let index = 0; index < keys.length; index += 1000) {
      await ctx.env.UPLOADS.delete(keys.slice(index, index + 1000))
    }
  }

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({
    deletedCount: duplicateUuids.length,
    deletedSubmissions: duplicateUuids,
  }, { requestId: ctx.requestId })
})
