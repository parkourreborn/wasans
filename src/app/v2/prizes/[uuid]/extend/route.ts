import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { extendPrizeDeadline, PrizeError } from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { ends_at?: unknown } | null
  const endsAt = body?.ends_at
  if (endsAt !== null && typeof endsAt !== "number") {
    return validationError("ends_at (unix seconds, or null for unlimited) is required", ctx.requestId)
  }

  try {
    const prize = await extendPrizeDeadline(ctx.db, uuid, endsAt)

    await insertAuditLog(ctx.db, "prize_deadline_extended", "prize", uuid, {
      actor: user,
      details: { ends_at: endsAt },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(prize, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof PrizeError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
