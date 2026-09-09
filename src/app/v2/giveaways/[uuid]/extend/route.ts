import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { extendGiveawayDeadline, GiveawayError } from "@/lib/server/repositories/giveaway-repository"
import { notifyGiveawayChanged } from "@/lib/server/services/giveaway-notify-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { ends_at?: unknown } | null
  const endsAt = typeof body?.ends_at === "number" ? body.ends_at : NaN
  if (!Number.isFinite(endsAt)) {
    return validationError("ends_at (unix seconds) is required", ctx.requestId)
  }

  try {
    const giveaway = await extendGiveawayDeadline(ctx.db, uuid, endsAt)

    await insertAuditLog(ctx.db, "giveaway_deadline_extended", "giveaway", uuid, {
      actor: user,
      details: { ends_at: endsAt },
    })
    await bumpCacheGeneration(ctx.cache)
    ctx.ctx.waitUntil(notifyGiveawayChanged(ctx.db, uuid))

    return jsonOk(giveaway, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof GiveawayError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
