import { jsonError, parsePagination } from "@/lib/server/http"
import { listComboSubmissions } from "@/lib/server/repositories/combo-submission-repository"
import { isFeatureEnabled } from "@/lib/server/repositories/feature-flag-repository"
import { getSubmissionBan } from "@/lib/server/repositories/submission-ban-repository"
import { createComboSubmissionFromRequest, type IncomingComboSubmission } from "@/lib/server/services/combo-submission-write-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import {
  buildRequestHash,
  lookupIdempotentResponse,
  readIdempotencyKey,
  storeIdempotentResponse,
} from "@/lib/server/services/idempotency-service"
import { getSubmissionErrorMessage, getSubmissionErrorStatus } from "@/lib/submission-errors"
import { formatSubmissionBanMessage } from "@/lib/submission-bans"
import { bumpCacheGeneration, cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const url = new URL(ctx.request.url)
  const { page, limit, offset } = parsePagination(url, { page: 1, limit: 50, maxLimit: 100 })
  const state = url.searchParams.get("state")
  const category = url.searchParams.get("category")
  const playerUuid = url.searchParams.get("player_uuid")
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase()

  const key = await cacheKey(
    ctx.cache,
    "combo-submissions",
    "list",
    page,
    limit,
    state || "-",
    category || "-",
    playerUuid || "-",
    search || "-"
  )
  const { value } = await readThroughCache(ctx.cache, key, 60, () =>
    listComboSubmissions(ctx.db, { limit, offset, state, category, playerUuid, search: search || undefined })
  )

  return jsonOk(value.results, { meta: { page, limit, count: value.total }, requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonError("Authentication required", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  if (!(await isFeatureEnabled(ctx.db, "combo_submissions_enabled"))) {
    return jsonError("Combo submissions are currently disabled", 403, { code: "forbidden", requestId: ctx.requestId })
  }

  // Reuses the same submission_bans table/check as trial submissions — one
  // ban blocks both.
  const submissionBan = await getSubmissionBan(ctx.db, ctx.auth.uuid)
  if (submissionBan) {
    return jsonError(formatSubmissionBanMessage(submissionBan.reason), 403, {
      code: "forbidden",
      requestId: ctx.requestId,
      details: { banned_at: submissionBan.banned_at },
    })
  }

  const writeRate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:combo-submissions:create", ctx.auth.uuid), {
    limit: 20,
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

  const rawBody = await ctx.request.text()
  let body: IncomingComboSubmission | null = null
  try {
    body = rawBody ? (JSON.parse(rawBody) as IncomingComboSubmission) : null
  } catch {
    return jsonError("Invalid JSON request body", 400, { code: "validation_error", requestId: ctx.requestId })
  }

  const providedIdempotencyKey = readIdempotencyKey(ctx.request)
  const idempotencyKey = providedIdempotencyKey
    || await buildRequestHash("v2:combo-submissions.create:auto-key", ctx.auth.uuid, rawBody)

  const requestHash = await buildRequestHash("v2:combo-submissions.create", ctx.auth.uuid, rawBody)
  const idempotentResult = await lookupIdempotentResponse(ctx.db, {
    scope: "v2:combo-submissions.create",
    idempotencyKey,
    actorUuid: ctx.auth.uuid,
    requestHash,
  })

  if ("conflict" in idempotentResult && idempotentResult.conflict) {
    return jsonError("idempotency-key was already used with a different payload", 409, { code: "conflict", requestId: ctx.requestId })
  }

  if ("hit" in idempotentResult && idempotentResult.hit) {
    return jsonOk(JSON.parse(idempotentResult.responseJson), {
      status: idempotentResult.statusCode,
      requestId: ctx.requestId,
      headers: { "idempotent-replayed": "true" },
    })
  }

  try {
    const result = await createComboSubmissionFromRequest(ctx.db, ctx.env, { uuid: ctx.auth.uuid }, body)
    const payload = { results: result ? [result] : [] }

    await storeIdempotentResponse(ctx.db, {
      scope: "v2:combo-submissions.create",
      idempotencyKey,
      actorUuid: ctx.auth.uuid,
      requestHash,
      responseJson: JSON.stringify(payload),
      statusCode: 201,
      ttlSeconds: 60 * 60,
    })

    await bumpCacheGeneration(ctx.cache)

    return jsonOk(payload, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    const message = getSubmissionErrorMessage(error instanceof Error ? error.message : null, "Unable to create combo submission")
    const status = getSubmissionErrorStatus(message)
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 401 ? "unauthorized" : status === 409 ? "conflict" : status === 429 ? "rate_limited" : status === 500 ? "internal_error" : "validation_error",
      requestId: ctx.requestId,
    })
  }
})
