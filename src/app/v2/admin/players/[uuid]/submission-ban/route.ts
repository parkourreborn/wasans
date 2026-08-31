import { jsonError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { PERMISSION_OWNER } from "@/lib/server/auth"
import { getPlayerByUuid } from "@/lib/server/repositories/player-repository"
import {
  banPlayerFromSubmitting,
  unbanPlayerFromSubmitting,
} from "@/lib/server/repositories/submission-ban-repository"
import { normalizeSubmissionBanReason } from "@/lib/submission-bans"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

// PUT bans the player from creating new submissions; DELETE lifts the ban.
// A ban only blocks new submissions — the player keeps their account, their
// approved runs, and their score.
export const PUT = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const actor = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { reason?: unknown } | null
  const reason = normalizeSubmissionBanReason(body?.reason)

  const target = await getPlayerByUuid(ctx.db, uuid)
  if (!target) {
    return jsonError("Player was not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  // Owners hold the only key to this endpoint, so banning one (yourself
  // included) could only ever be an accident someone has to undo by hand.
  if (target.permission >= PERMISSION_OWNER) {
    return jsonError("Owners cannot be banned from submitting", 409, { code: "conflict", requestId: ctx.requestId })
  }

  const now = Math.floor(Date.now() / 1000)
  await banPlayerFromSubmitting(ctx.db, { playerUuid: uuid, reason, actor, now })

  await insertAuditLog(ctx.db, "player_submission_banned", "player", uuid, {
    actor,
    details: { target_player_name: target.player_name, reason },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk(
    {
      player_uuid: uuid,
      player_name: target.player_name,
      reason,
      banned_at: now,
      banned_by_uuid: actor.uuid,
      banned_by_name: actor.player_name,
    },
    { requestId: ctx.requestId }
  )
})

export const DELETE = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const actor = await requireV2Owner(ctx)

  const removed = await unbanPlayerFromSubmitting(ctx.db, uuid)
  if (!removed) {
    return jsonError("That player is not banned from submitting", 404, { code: "not_found", requestId: ctx.requestId })
  }

  const target = await getPlayerByUuid(ctx.db, uuid)

  await insertAuditLog(ctx.db, "player_submission_unbanned", "player", uuid, {
    actor,
    details: { target_player_name: target?.player_name ?? null },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, uuid }, { requestId: ctx.requestId })
})
