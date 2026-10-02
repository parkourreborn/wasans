import { listFeatureFlags } from "@/lib/server/repositories/feature-flag-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const results = await listFeatureFlags(ctx.db)
  return jsonOk(results, { requestId: ctx.requestId })
})
