import { jsonError, validationError } from "@/lib/server/http"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { isOwner } from "@/lib/server/auth"
import { getSubmissionWithScore } from "@/lib/server/repositories/submission-repository"
import { isFeatureEnabled } from "@/lib/server/repositories/feature-flag-repository"
import { deleteSubmission, patchSubmission, resolveModeratorUser } from "@/lib/server/services/moderation-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import { getSubmissionErrorMessage, getSubmissionErrorStatus } from "@/lib/submission-errors"
import { bumpCacheGeneration, cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

function isValidSubmissionUuid(uuid: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(uuid)
}

export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const key = await cacheKey(ctx.cache, "submissions", "detail", uuid)
  const { value: result } = await readThroughCache(ctx.cache, key, 60, () => getSubmissionWithScore(ctx.db, uuid))

  return jsonOk({ results: result ? [result] : [] }, { requestId: ctx.requestId })
})

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const body = await ctx.request.json().catch(() => null) as {
    discordId?: unknown
    state?: unknown
    moderator_note?: unknown
    time?: unknown
  } | null
  if (!body) {
    return validationError("Invalid JSON request body", ctx.requestId)
  }

  // Session moderators authenticate via the v2 JWT cookie; the Discord bot
  // (no browser session) authenticates via its bot API key + a discordId in
  // the body, resolved to a moderator account here.
  const sessionUser = ctx.auth ? await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request) : null
  const moderatorLookup = await resolveModeratorUser(ctx.request, ctx.env, sessionUser, body?.discordId, ctx.requestId)

  if (moderatorLookup.error || !moderatorLookup.user) {
    return jsonError(moderatorLookup.error || "Moderator permission is required", 403, {
      code: "forbidden",
      requestId: ctx.requestId,
      details: { debug: moderatorLookup.debugInfo },
    })
  }

  const user = moderatorLookup.user

  if (!(await isFeatureEnabled(ctx.db, "moderation_enabled")) && !isOwner(user)) {
    return jsonError("Moderation is currently disabled", 403, { code: "forbidden", requestId: ctx.requestId })
  }

  const writeRate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:submissions:patch", user.uuid), {
    limit: 60,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: { "retry-after": String(writeRate.retryAfter) },
    })
  }

  try {
    const updated = await patchSubmission({ env: ctx.env, ctx: ctx.ctx, uuid, user }, body)
    await bumpCacheGeneration(ctx.cache)

    return jsonOk({ results: updated ? [updated] : [] }, { requestId: ctx.requestId })
  } catch (error) {
    const message = getSubmissionErrorMessage(error instanceof Error ? error.message : null, "Unable to patch submission")
    const status = getSubmissionErrorStatus(message)
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 429 ? "rate_limited" : "validation_error",
      requestId: ctx.requestId,
    })
  }
})

export const DELETE = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!isValidSubmissionUuid(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  if (!ctx.auth) {
    return jsonError("Authentication is required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  if (!user) {
    return jsonError("Authentication is required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const writeRate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:submissions:delete", user.uuid), {
    limit: 30,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId: ctx.requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: { "retry-after": String(writeRate.retryAfter) },
    })
  }

  try {
    await deleteSubmission(ctx.env, ctx.ctx, uuid, user)
    await bumpCacheGeneration(ctx.cache)

    return jsonOk({ ok: true }, { requestId: ctx.requestId })
  } catch (error) {
    const message = getSubmissionErrorMessage(error instanceof Error ? error.message : null, "Unable to delete submission")
    const status = getSubmissionErrorStatus(message)
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 429 ? "rate_limited" : "validation_error",
      requestId: ctx.requestId,
    })
  }
})
