import { getAdminOverview } from "@/lib/server/repositories/admin-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// The admin Overview page: what's waiting on the owner, site health, and
// activity for the last 7 or 30 days against the period before.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const period = new URL(ctx.request.url).searchParams.get("period") === "30" ? 30 : 7
  const overview = await getAdminOverview(ctx.db, Math.floor(Date.now() / 1000), period)
  return jsonOk(overview, { requestId: ctx.requestId })
})
