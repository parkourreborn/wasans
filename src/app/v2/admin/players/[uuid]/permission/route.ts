import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { PERMISSION_MODERATOR, PERMISSION_OWNER } from "@/lib/server/auth"
import { countOwners, getPlayerByUuid, setPlayerPermission } from "@/lib/server/repositories/player-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

const VALID_PERMISSIONS = [0, PERMISSION_MODERATOR, PERMISSION_OWNER]

export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const actor = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as { permission?: unknown } | null
  const permission = typeof body?.permission === "number" ? body.permission : NaN

  if (!VALID_PERMISSIONS.includes(permission)) {
    return validationError("permission must be 0 (member), 1 (moderator), or 2 (owner)", ctx.requestId)
  }

  const target = await getPlayerByUuid(ctx.db, uuid)
  if (!target) {
    return jsonError("Player was not found", 404, { code: "not_found", requestId: ctx.requestId })
  }

  // Refuse to demote the last remaining owner — that would lock everyone
  // out of the owner-only controls (feature flags, trial management, and
  // this endpoint itself) with no way back in short of direct DB access.
  if (target.permission >= PERMISSION_OWNER && permission < PERMISSION_OWNER) {
    const owners = await countOwners(ctx.db)
    if (owners <= 1) {
      return jsonError("Refusing to demote the last remaining owner", 409, { code: "conflict", requestId: ctx.requestId })
    }
  }

  await setPlayerPermission(ctx.db, uuid, permission)

  await insertAuditLog(ctx.db, "player_permission_changed", "player", uuid, {
    actor,
    details: { target_player_name: target.player_name, old_permission: target.permission, new_permission: permission },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true, uuid, permission }, { requestId: ctx.requestId })
})
