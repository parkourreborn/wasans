import { listImportQueue } from "@/lib/server/services/wr-import-service"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// The old WR Drive import queue (/admin/site/wr-imports): every file found
// in the Drive, what its name says, the players it could be and the runs on
// the site it could already be. See wr-import-service.ts.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  return jsonOk(await listImportQueue(ctx.env, ctx.db), { requestId: ctx.requestId })
})
