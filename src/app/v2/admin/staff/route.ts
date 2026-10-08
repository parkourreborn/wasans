import { listStaff } from "@/lib/server/repositories/admin-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Everyone with a permission above player, highest first.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  return jsonOk(await listStaff(ctx.db), { requestId: ctx.requestId })
})
