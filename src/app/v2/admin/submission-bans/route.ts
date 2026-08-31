import { listSubmissionBans } from "@/lib/server/repositories/submission-ban-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const results = await listSubmissionBans(ctx.db)
  return jsonOk(results, { requestId: ctx.requestId })
})
