import { countPendingPrizeCandidates, listPendingPrizeCandidates } from "@/lib/server/repositories/prize-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Owner-only admin data (low traffic) -- skips the KV cache like admin/flags
// does, since freshness matters more than a 60s TTL here (the nav badge and
// review queue should reflect a confirm/reject immediately).
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const countOnly = new URL(ctx.request.url).searchParams.get("count") === "1"
  if (countOnly) {
    const count = await countPendingPrizeCandidates(ctx.db)
    return jsonOk({ count }, { requestId: ctx.requestId })
  }

  const candidates = await listPendingPrizeCandidates(ctx.db)
  return jsonOk(candidates, { requestId: ctx.requestId })
})
