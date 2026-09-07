import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { enforceRateLimit, getRateLimitKey } from "@/lib/server/services/rate-limit-service"
import {
  buildAccessCookie,
  buildRefreshCookie,
  expiredV2AuthCookies,
  getJwtSecret,
  getRefreshCookieValue,
  issueAccessToken,
  jsonOk,
  withV2Context,
} from "@/lib/server/v2/http"
import { rotateRefreshToken } from "@/lib/server/v2/tokens"

// Every way a live session can end here, recorded so a player reporting
// "it logged me out again" can be answered from the log instead of guessed
// at. Deliberately NOT logged: a request with no refresh cookie at all
// (that is just a signed-out visitor, and logging it would flood the audit
// table the way the open error-log endpoint used to) and a rate-limited one
// (the client retries those).
type RefreshFailureReason =
  // A refresh token was presented that we have no record of, or that had
  // passed its expiry. The ordinary end of a long-idle session.
  | "token_unknown_or_expired"
  // A token was presented that had already been rotated away, and could not
  // be explained as a lost response or a race between tabs. Treated as
  // replay, so the whole family was revoked. If this shows up for real
  // players, the reuse heuristics are still too strict.
  | "replay_detected"
  // The token was fine but the player row came back empty or not active.
  | "account_unavailable"

async function recordRefreshFailure(
  ctx: { db: D1Database; request: Request; requestId: string },
  reason: RefreshFailureReason,
  playerUuid: string | null
) {
  try {
    await insertAuditLog(ctx.db, "auth_refresh_failed", "session", playerUuid, {
      details: {
        source: "auth_refresh",
        reason,
        request_id: ctx.requestId,
        user_agent: ctx.request.headers.get("user-agent")?.slice(0, 300) || null,
      },
    })
  } catch (error) {
    // Never let bookkeeping turn a handled 401 into a 500.
    console.error("Failed to record refresh failure:", error)
  }
}

export const POST = withV2Context(async (ctx) => {
  // Keyed per-IP, and every client behind carrier NAT or a school/office
  // network shares one bucket — with tabs also refreshing proactively every
  // 10 minutes, a limit sized for a single browser turns into other people's
  // sessions being refused. Kept high enough that only a genuine flood trips
  // it; the client treats a 429 here as retryable rather than as a sign-out.
  const rate = await enforceRateLimit(ctx.db, getRateLimitKey(ctx.request, "v2:auth:refresh"), {
    limit: 300,
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

  const presented = getRefreshCookieValue(ctx.request)
  if (!presented) {
    return jsonError("Missing refresh token", 401, { code: "unauthorized", requestId: ctx.requestId })
  }

  const result = await rotateRefreshToken(ctx.db, presented)

  if (result.status !== "ok") {
    await recordRefreshFailure(
      ctx,
      result.status === "reused" ? "replay_detected" : "token_unknown_or_expired",
      result.status === "reused" ? result.playerUuid : null
    )

    const headers = new Headers()
    for (const cookie of expiredV2AuthCookies(ctx.request)) {
      headers.append("set-cookie", cookie)
    }
    return jsonError("Refresh token invalid", 401, { code: "unauthorized", requestId: ctx.requestId, headers })
  }

  // Read past the replicas: a player who is still perfectly signed in must
  // never be turned away because a replica hasn't caught up with their row.
  const user = await loadAuthUserByUuid(ctx.db, result.playerUuid, ctx.request, { readFromPrimary: true })
  if (!user) {
    await recordRefreshFailure(ctx, "account_unavailable", result.playerUuid)

    // Deny this refresh, but don't revoke the whole family: both paths that
    // deactivate or delete an account already revoke its tokens at the
    // source, so anything reaching here is an unexplained empty read, and
    // answering it by destroying every session the player has is the kind of
    // collateral damage that is impossible to debug from the outside.
    const headers = new Headers()
    for (const cookie of expiredV2AuthCookies(ctx.request)) {
      headers.append("set-cookie", cookie)
    }
    return jsonError("Account not available", 401, { code: "unauthorized", requestId: ctx.requestId, headers })
  }

  const secret = getJwtSecret(ctx.env)
  const accessToken = await issueAccessToken(user.uuid, user.permission, secret)

  const headers = new Headers()
  headers.append("set-cookie", buildAccessCookie(ctx.request, accessToken))
  headers.append("set-cookie", buildRefreshCookie(ctx.request, result.issued.refreshToken, result.issued.expiresAt))

  return jsonOk({ user }, { requestId: ctx.requestId, headers })
})
