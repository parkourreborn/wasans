import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { FEATURE_FLAG_KEYS, type FeatureFlagKey, setFeatureFlag } from "@/lib/server/repositories/feature-flag-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

export const PATCH = withV2Context<{ key: string }>(async (ctx, { key }) => {
  const user = await requireV2Owner(ctx)

  if (!FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) {
    return validationError(`Unknown feature flag "${key}"`, ctx.requestId)
  }

  const body = await ctx.request.json().catch(() => null) as { enabled?: unknown } | null
  if (!body || typeof body.enabled !== "boolean") {
    return validationError("enabled (boolean) is required", ctx.requestId)
  }

  const flagKey = key as FeatureFlagKey
  await setFeatureFlag(ctx.db, flagKey, body.enabled, user.player_name)

  await insertAuditLog(ctx.db, "feature_flag_changed", "feature_flag", flagKey, {
    actor: user,
    details: { key: flagKey, enabled: body.enabled },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
