export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  })
}

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return jsonResponse({ error: message, ...(details || {}) }, status)
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
