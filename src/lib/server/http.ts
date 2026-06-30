export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_error"
  | "internal_error"

type JsonResponseOptions = {
  headers?: HeadersInit
  requestId?: string
}

export function getRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim()
  return incoming && incoming.length <= 128 ? incoming : crypto.randomUUID()
}

export function jsonResponse(data: unknown, status = 200, options?: HeadersInit | JsonResponseOptions) {
  const headersInput = options && "headers" in (options as JsonResponseOptions)
    ? (options as JsonResponseOptions).headers
    : (options as HeadersInit | undefined)
  const requestId = options && "requestId" in (options as JsonResponseOptions)
    ? (options as JsonResponseOptions).requestId
    : undefined

  const headers = new Headers({
    "content-type": "application/json",
  })

  if (headersInput) {
    const extraHeaders = new Headers(headersInput)
    extraHeaders.forEach((value, key) => headers.set(key, value))
  }

  if (requestId) {
    headers.set("x-request-id", requestId)
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  })
}

export function jsonError(
  message: string,
  status = 400,
  options?: {
    code?: ApiErrorCode
    details?: Record<string, unknown>
    requestId?: string
    headers?: HeadersInit
  }
) {
  return jsonResponse({
    error: {
      code: options?.code || "bad_request",
      message,
      request_id: options?.requestId || null,
      details: options?.details || null,
    },
  }, status, { headers: options?.headers, requestId: options?.requestId })
}

export function parsePagination(url: URL, defaults?: { page?: number; limit?: number; maxLimit?: number }) {
  const page = Math.max(1, Number(url.searchParams.get("page") || String(defaults?.page ?? 1)))
  const maxLimit = defaults?.maxLimit ?? 100
  const requestedLimit = Number(url.searchParams.get("limit") || String(defaults?.limit ?? 50))
  const limit = Math.max(1, Math.min(maxLimit, Number.isFinite(requestedLimit) ? requestedLimit : 50))
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

export function parseBoolean(value: string | null, fallback = false) {
  if (value == null) {
    return fallback
  }

  return value === "1" || value === "true"
}

export function validationError(message: string, requestId?: string, details?: Record<string, unknown>) {
  return jsonError(message, 400, {
    code: "validation_error",
    requestId,
    details,
  })
}
