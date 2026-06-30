import "server-only"

export const legacyDeprecationHeaders = {
  deprecation: "true",
  sunset: "Wed, 30 Sep 2026 00:00:00 GMT",
  link: "</api/v1>; rel=successor-version",
}

export function withDeprecationHeaders(response: Response) {
  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(legacyDeprecationHeaders)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
