import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { reorderTrials } from "@/lib/server/repositories/trial-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Moderator(ctx)

  const body = await ctx.request.json().catch(() => null) as { names?: unknown } | null
  const names = Array.isArray(body?.names) ? body.names.filter((name): name is string => typeof name === "string") : null

  if (!names || names.length === 0) {
    return validationError("names must be a non-empty array of trial names", ctx.requestId)
  }

  await reorderTrials(ctx.db, names)

  await insertAuditLog(ctx.db, "trial_reordered", "trial", null, {
    actor: user,
    details: { reordered: names },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
