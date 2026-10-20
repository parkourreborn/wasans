import { insertAuditLog } from "@/lib/server/audit"
import { validationError } from "@/lib/server/http"
import { scanDriveFolder } from "@/lib/server/services/wr-import-service"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { driveFolderId } from "@/lib/wr-import"

// Lists every video in a Drive folder and its subfolders into the import
// queue. Scanning again picks up files added since and leaves the rest be.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  const body = (await ctx.request.json().catch(() => null)) as { folder?: unknown } | null
  const folderId = typeof body?.folder === "string" ? driveFolderId(body.folder) : null
  if (!folderId) {
    return validationError("Paste the Drive folder’s link", ctx.requestId)
  }

  const result = await scanDriveFolder(ctx.env, ctx.db, folderId, Math.floor(Date.now() / 1000))
  await insertAuditLog(ctx.db, "wr_drive_scanned", "maintenance", null, { actor: user, details: { folder_id: folderId, ...result } })
  return jsonOk(result, { requestId: ctx.requestId })
})
