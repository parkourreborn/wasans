import { jsonError } from "@/lib/server/http"
import { loadAuthUserByUuid } from "@/lib/server/auth"
import { getSubmissionBan } from "@/lib/server/repositories/submission-ban-repository"
import { isMissingRequiredRobloxLink } from "@/lib/server/services/linked-accounts-service"
import { getRefreshCookieValue, jsonOk, withV2Context } from "@/lib/server/v2/http"

// Never let a browser or edge cache hold on to who is signed in.
const noStore = { "cache-control": "no-store" }

export const GET = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    // The refresh cookie is scoped to Path=/v2/auth, which also covers this
    // route, so its presence means the player is still signed in and only
    // the 15-minute access token has expired. Answer 401 so V2AuthRefresh
    // refreshes and retries. Answering 200 {user: null} — as this route used
    // to — reads as "signed out" to every page that calls it, and because it
    // is not a 401 nothing ever triggered a refresh: that is why sessions
    // appeared to end 15 minutes after login while the refresh token behind
    // them was still good.
    if (getRefreshCookieValue(ctx.request)) {
      // Worded for a human: the client normally turns this into a silent
      // refresh, so a player only ever reads it if the refresh itself failed.
      return jsonError("Your session expired. Sign in again to continue.", 401, {
        code: "unauthorized",
        requestId: ctx.requestId,
        headers: noStore,
      })
    }

    // No refresh cookie: genuinely signed out, so don't send the client off
    // to attempt a refresh that cannot succeed.
    return jsonOk({ user: null, submission_ban: null, roblox_link_required: false }, { requestId: ctx.requestId, headers: noStore })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  const [ban, robloxLinkRequired] = user
    ? await Promise.all([getSubmissionBan(ctx.db, user.uuid), isMissingRequiredRobloxLink(ctx.db, user.uuid)])
    : [null, false]

  return jsonOk(
    {
      user,
      submission_ban: ban
        ? { reason: ban.reason, banned_at: ban.banned_at, banned_by_name: ban.banned_by_name }
        : null,
      // Submitting needs a linked Roblox account and this player has none.
      roblox_link_required: robloxLinkRequired,
    },
    { requestId: ctx.requestId, headers: noStore }
  )
})
