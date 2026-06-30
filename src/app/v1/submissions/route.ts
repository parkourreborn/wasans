import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getAuthUser } from "@/lib/server/auth"
import { getRequestId, jsonError, jsonResponse, validationError } from "@/lib/server/http"
import { querySubmissions } from "@/lib/server/services/submission-query-service"
import { createSubmissionsFromRequest } from "@/lib/server/services/submission-write-service"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import {
  buildRequestHash,
  lookupIdempotentResponse,
  readIdempotencyKey,
  readIdempotencyKeyFromFormData,
  storeIdempotentResponse,
} from "@/lib/server/services/idempotency-service"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, {
      code: "internal_error",
      requestId,
    })
  }

  const readRate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:submissions:list"), {
    limit: 120,
    windowSeconds: 60,
  })

  if (!readRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: readRate.retryAfter },
      headers: {
        "retry-after": String(readRate.retryAfter),
        "x-ratelimit-limit": String(readRate.limit),
        "x-ratelimit-remaining": String(readRate.remaining),
      },
    })
  }

  const data = await querySubmissions(env.wasans, request)
  return jsonResponse(data, 200, {
    headers: {
      ...cacheHeaders,
      "x-ratelimit-limit": String(readRate.limit),
      "x-ratelimit-remaining": String(readRate.remaining),
    },
    requestId,
  })
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500, {
      code: "internal_error",
      requestId,
    })
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user) {
    return jsonError("Authentication required", 401, {
      code: "unauthorized",
      requestId,
    })
  }

  const writeRate = await enforceRateLimit(env.wasans, getRateLimitKey(request, "v1:submissions:create", user.uuid), {
    limit: 20,
    windowSeconds: 60,
  })

  if (!writeRate.allowed) {
    return jsonError("Rate limit exceeded", 429, {
      code: "rate_limited",
      requestId,
      details: { retry_after: writeRate.retryAfter },
      headers: {
        "retry-after": String(writeRate.retryAfter),
        "x-ratelimit-limit": String(writeRate.limit),
        "x-ratelimit-remaining": String(writeRate.remaining),
      },
    })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return jsonError("Submission payload is too large or invalid", 413, {
      code: "validation_error",
      requestId,
    })
  }

  const idempotencyKey = readIdempotencyKey(request) || readIdempotencyKeyFromFormData(formData)
  if (!idempotencyKey) {
    return validationError("Missing or invalid idempotency-key header", requestId)
  }

  const rawSubmissions = String(formData.get("submissions") || "")
  const requestHash = await buildRequestHash("submissions.create", user.uuid, rawSubmissions)
  const idempotentResult = await lookupIdempotentResponse(env.wasans, {
    scope: "submissions.create",
    idempotencyKey,
    actorUuid: user.uuid,
    requestHash,
  })

  if ("conflict" in idempotentResult && idempotentResult.conflict) {
    return jsonError("idempotency-key was already used with a different payload", 409, {
      code: "conflict",
      requestId,
    })
  }

  if ("hit" in idempotentResult && idempotentResult.hit) {
    return jsonResponse(JSON.parse(idempotentResult.responseJson), idempotentResult.statusCode, {
      requestId,
      headers: {
        "idempotent-replayed": "true",
        "x-ratelimit-limit": String(writeRate.limit),
        "x-ratelimit-remaining": String(writeRate.remaining),
      },
    })
  }

  try {
    const writer = await createSubmissionsFromRequest(env.wasans, env, { uuid: user.uuid })
    const results = await writer(formData)
    const payload = { results }

    await storeIdempotentResponse(env.wasans, {
      scope: "submissions.create",
      idempotencyKey,
      actorUuid: user.uuid,
      requestHash,
      responseJson: JSON.stringify(payload),
      statusCode: 201,
      ttlSeconds: 60 * 60,
    })

    return jsonResponse(payload, 201, {
      requestId,
      headers: {
        "x-ratelimit-limit": String(writeRate.limit),
        "x-ratelimit-remaining": String(writeRate.remaining),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create submission"
    const status = message.includes("not found") ? 404 : message.includes("Authentication") ? 401 : 400
    return jsonError(message, status, {
      code: status === 404 ? "not_found" : status === 401 ? "unauthorized" : "validation_error",
      requestId,
    })
  }
}
