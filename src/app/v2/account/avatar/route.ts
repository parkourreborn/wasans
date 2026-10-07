import { jsonError, validationError } from "@/lib/server/http"
import { isRobloxUserId } from "@/lib/server/roblox"
import { AccountLinkError } from "@/lib/server/services/auth-service"
import { setAvatarRobloxAccount } from "@/lib/server/services/linked-accounts-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2User, withV2Context } from "@/lib/server/v2/http"

// Picks which linked Roblox account's headshot is the player's avatar.
export const PATCH = withV2Context(async (ctx) => {
  const user = await requireV2User(ctx)

  const body = await ctx.request.json().catch(() => null) as { roblox_user_id?: unknown } | null
  if (!body || !isRobloxUserId(body.roblox_user_id)) {
    return validationError("roblox_user_id is required", ctx.requestId)
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:avatar", user.uuid), {
    limit: 20,
    windowSeconds: 60,
  })

  if (!rate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: rate.retryAfter },
      headers: { "retry-after": String(rate.retryAfter) },
    })
  }

  try {
    await setAvatarRobloxAccount(ctx.db, user.uuid, body.roblox_user_id)
  } catch (error) {
    if (error instanceof AccountLinkError) {
      return jsonError(error.message, 409, { code: "conflict", requestId: ctx.requestId })
    }
    throw error
  }

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId, headers: { "cache-control": "no-store" } })
})
