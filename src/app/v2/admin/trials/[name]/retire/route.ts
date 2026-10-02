import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { TrialLifecycleError, retireTrial } from "@/lib/server/repositories/trial-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ name: string }>(async (ctx, { name }) => {
  const user = await requireV2Moderator(ctx)
  const trialName = decodeURIComponent(name)

  try {
    await retireTrial(ctx.db, trialName, Math.floor(Date.now() / 1000))
  } catch (error) {
    if (error instanceof TrialLifecycleError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 409, {
        code: error.code === "not_found" ? "not_found" : "conflict",
        requestId: ctx.requestId,
      })
    }
    throw error
  }

  await insertAuditLog(ctx.db, "trial_retired", "trial", trialName, {
    actor: user,
    details: { trial_name: trialName },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
