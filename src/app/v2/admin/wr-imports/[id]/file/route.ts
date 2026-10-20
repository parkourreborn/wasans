import { jsonError, validationError } from "@/lib/server/http"
import { presignOriginalGet } from "@/lib/server/r2-presign"
import { requireV2Owner, withV2Params } from "@/lib/server/v2/http"
import { importKey, isDriveFileId } from "@/lib/wr-import"

// Owners: a file from the old WR Drive as copied into the uploads bucket,
// to watch in the import queue. Redirects to a presigned link that plays
// inline and is good for an hour.
export const GET = withV2Params<{ id: string }>(async (ctx, { id }) => {
  await requireV2Owner(ctx)
  if (!isDriveFileId(id)) {
    return validationError("Invalid Drive file id", ctx.requestId)
  }

  const key = importKey(id)
  if (!ctx.env.UPLOADS || !(await ctx.env.UPLOADS.head(key))) {
    return jsonError("That file hasn't been copied from the Drive yet", 404, { code: "not_found", requestId: ctx.requestId })
  }

  const url = await presignOriginalGet(ctx.env, { key, filename: id, ttlSeconds: 60 * 60, inline: true })
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } })
})
