import { getAuditLogs } from "@/lib/server/services/audit-log-service"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Moderator(ctx)

  const result = await getAuditLogs(ctx.request, ctx.db)
  return jsonOk(result.body, { requestId: ctx.requestId })
})
