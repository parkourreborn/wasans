import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import {
  TrialLifecycleError,
  createTrial,
  listTrialLifecycles,
} from "@/lib/server/repositories/trial-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Moderator(ctx)

  const results = await listTrialLifecycles(ctx.db)
  return jsonOk(results, { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Moderator(ctx)

  const body = await ctx.request.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) {
    return validationError("name is required", ctx.requestId)
  }

  try {
    await createTrial(ctx.db, name, Math.floor(Date.now() / 1000))
  } catch (error) {
    if (error instanceof TrialLifecycleError) {
      return jsonError(error.message, error.code === "unknown_trial" ? 400 : 409, {
        code: error.code === "unknown_trial" ? "validation_error" : "conflict",
        requestId: ctx.requestId,
      })
    }
    throw error
  }

  await insertAuditLog(ctx.db, "trial_created", "trial", name, {
    actor: user,
    details: { trial_name: name },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { status: 201, requestId: ctx.requestId })
})
