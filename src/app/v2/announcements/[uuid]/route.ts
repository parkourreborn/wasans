import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { AnnouncementError, deleteAnnouncement } from "@/lib/server/repositories/announcement-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const DELETE = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  try {
    await deleteAnnouncement(ctx.db, uuid)
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }

  await insertAuditLog(ctx.db, "announcement_deleted", "announcement", uuid, { actor: user })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
