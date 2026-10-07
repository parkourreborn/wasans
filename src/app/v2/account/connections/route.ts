import { jsonError, validationError } from "@/lib/server/http"
import { isFeatureEnabled } from "@/lib/server/repositories/feature-flag-repository"
import { AccountLinkError, isOAuthProvider } from "@/lib/server/services/auth-service"
import { listLinkedAccounts, unlinkAccount } from "@/lib/server/services/linked-accounts-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2User, withV2Context } from "@/lib/server/v2/http"
import { buildOAuthStart } from "@/lib/server/v2/oauth"

const noStore = { "cache-control": "no-store" }

// The signed-in player's linked login methods.
export const GET = withV2Context(async (ctx) => {
  const user = await requireV2User(ctx)
  const [connections, robloxRequired] = await Promise.all([
    listLinkedAccounts(ctx.db, ctx.cache, user.uuid),
    isFeatureEnabled(ctx.db, "require_roblox_link"),
  ])

  return jsonOk(
    { connections, roblox_required_to_submit: robloxRequired },
    { requestId: ctx.requestId, headers: noStore }
  )
})

// Starts linking another account: answers with the provider URL to send the
// browser to, and sets the cookies that tie the callback to this player.
// An API call rather than a plain link so an expired access token gets
// refreshed by the client first, like any other API call.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2User(ctx)

  const body = await ctx.request.json().catch(() => null) as { provider?: unknown; next?: unknown } | null
  if (!body || !isOAuthProvider(body.provider)) {
    return validationError("provider must be one of discord, google, roblox", ctx.requestId)
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:connections:link", user.uuid), {
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

  const next = typeof body.next === "string" ? body.next : null
  const { authorizeUrl, cookies } = await buildOAuthStart(ctx.request, ctx.env, body.provider, { mode: "link", playerUuid: user.uuid }, next)
  const headers = new Headers(noStore)
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie)
  }

  return jsonOk({ authorize_url: authorizeUrl }, { requestId: ctx.requestId, headers })
})

export const DELETE = withV2Context(async (ctx) => {
  const user = await requireV2User(ctx)

  const body = await ctx.request.json().catch(() => null) as { provider?: unknown; account_id?: unknown } | null
  if (!body || !isOAuthProvider(body.provider) || typeof body.account_id !== "string" || !body.account_id) {
    return validationError("provider and account_id are required", ctx.requestId)
  }

  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:account:connections:unlink", user.uuid), {
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
    await unlinkAccount(ctx.db, user.uuid, body.provider, body.account_id)
  } catch (error) {
    if (error instanceof AccountLinkError) {
      return jsonError(error.message, 409, { code: "conflict", requestId: ctx.requestId })
    }
    throw error
  }

  // Unlinking Discord or the avatar's Roblox account changes the avatar
  // shown in every cached listing.
  await bumpCacheGeneration(ctx.cache)

  return jsonOk(
    { connections: await listLinkedAccounts(ctx.db, ctx.cache, user.uuid) },
    { requestId: ctx.requestId, headers: noStore }
  )
})
