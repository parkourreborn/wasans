import { validationError } from "@/lib/server/http"
import { importDriveFile, matchDriveFile, restoreDriveFile, skipDriveFile } from "@/lib/server/services/wr-import-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"
import { isDriveFileId } from "@/lib/wr-import"

// What an owner decided for one file in the import queue:
//  - "import": { trial, time, player_uuid, version, date } makes it a run.
//    Answers 409 with the run in details.match when the site already has
//    it, so the page can offer to match it instead.
//  - "match": the same fields plus submission_uuid, the site's run to keep
//    and backdate.
//  - "skip", and "restore" to put a skipped file back.
// Importing or matching streams the file once, so it can take a few seconds.
export const POST = withV2Params<{ id: string }>(async (ctx, { id }) => {
  const user = await requireV2Owner(ctx)
  if (!isDriveFileId(id)) {
    return validationError("Invalid Drive file id", ctx.requestId)
  }
  if (!ctx.env.UPLOADS) {
    throw new ApiError("Video storage isn't configured", 500, "internal_error")
  }

  const body = ((await ctx.request.json().catch(() => null)) ?? {}) as Record<string, unknown>
  let result
  if (body.action === "import") result = await importDriveFile(ctx.env, ctx.db, user, id, body)
  else if (body.action === "match") result = await matchDriveFile(ctx.env, ctx.db, user, id, body)
  else if (body.action === "skip") result = await skipDriveFile(ctx.env, ctx.db, user, id)
  else if (body.action === "restore") result = await restoreDriveFile(ctx.db, id)
  else return validationError("Unknown action", ctx.requestId)

  if (result.status === "imported" || result.status === "merged") {
    await bumpCacheGeneration(ctx.cache)
  }
  return jsonOk(result, { requestId: ctx.requestId })
})
