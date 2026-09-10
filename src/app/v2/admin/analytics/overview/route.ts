import { getSiteWideAnalyticsOverview } from "@/lib/server/analytics/admin-overview"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Moderator(ctx)

  const overview = await getSiteWideAnalyticsOverview(ctx.db)

  return jsonOk(overview, { requestId: ctx.requestId })
})
