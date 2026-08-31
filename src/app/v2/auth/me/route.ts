import { loadAuthUserByUuid } from "@/lib/server/auth"
import { getSubmissionBan } from "@/lib/server/repositories/submission-ban-repository"
import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  if (!ctx.auth) {
    return jsonOk({ user: null, submission_ban: null }, { requestId: ctx.requestId })
  }

  const user = await loadAuthUserByUuid(ctx.db, ctx.auth.uuid, ctx.request)
  const ban = user ? await getSubmissionBan(ctx.db, user.uuid) : null

  return jsonOk(
    {
      user,
      submission_ban: ban
        ? { reason: ban.reason, banned_at: ban.banned_at, banned_by_name: ban.banned_by_name }
        : null,
    },
    { requestId: ctx.requestId }
  )
})
