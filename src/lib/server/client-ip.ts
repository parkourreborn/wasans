import "server-only"

// Only cf-connecting-ip is trustworthy here: Cloudflare sets it on every
// request that reaches the Worker and a client cannot forge it. x-forwarded-for
// IS client-settable, so honouring it let anyone pick their own rate-limit
// bucket (send a fresh value per request and the limits never apply) and write
// chosen addresses into another player's IP history.
export function getClientIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown"
}
