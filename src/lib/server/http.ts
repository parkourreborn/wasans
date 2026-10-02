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

// Copies caller-supplied headers onto a response's headers WITHOUT losing
// repeated values.
//
// This exists because `extra.forEach((value, key) => target.set(key, value))`
// silently destroys Set-Cookie. Set-Cookie is the one header that
// legitimately appears more than once, and the Fetch spec deliberately does
// NOT combine its values when iterating — so forEach yields it once per
// cookie, and `set` overwrites the previous one each time. Two cookies go in
// and the last one comes out.
//
// That is what signed everyone out. A successful token refresh appends both
// the access cookie and the refresh cookie; the refresh cookie was appended
// second, so it won, and the new access cookie was thrown away before the
// response left the worker. Login was unaffected (it builds its own Response
// rather than going through these helpers), which is why sessions worked for
// exactly as long as the 15-minute access token and then died — the browser
// expired the access cookie and nothing ever replaced it.
export function mergeResponseHeaders(target: Headers, extra: HeadersInit) {
  const source = new Headers(extra)

  // getSetCookie is the only way to read repeated Set-Cookie values back out
  // intact. Where it exists, take the cookies from it and append each.
  const readSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const cookies = typeof readSetCookie === "function" ? readSetCookie.call(source) : null

  if (cookies) {
    for (const cookie of cookies) {
      target.append("set-cookie", cookie)
    }
  }

  source.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      // Already handled above. Without getSetCookie, append here instead —
      // appending is right for Set-Cookie either way, and never dropping a
      // cookie matters more than the tidiness of setting other headers.
      if (!cookies) {
        target.append("set-cookie", value)
      }
      return
    }

    target.set(key, value)
  })

  return target
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
    mergeResponseHeaders(headers, headersInput)
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
