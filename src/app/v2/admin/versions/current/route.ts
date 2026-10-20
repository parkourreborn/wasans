import { insertAuditLog } from "@/lib/server/audit"
import { getCurrentGameVersion, listGameVersions, setCurrentGameVersion } from "@/lib/server/repositories/game-version-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// { name } — makes that version the one new runs are stamped with. Runs
// that already have a version keep it.
export const PUT = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  const body = (await ctx.request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name : ""

  const previous = await getCurrentGameVersion(ctx.db)
  if (!(await setCurrentGameVersion(ctx.db, name))) {
    throw new ApiError("That version isn't on the list", 404, "not_found")
  }
  if (previous !== name) {
    await insertAuditLog(ctx.db, "game_version_made_current", "game_version", name, { actor: user, details: { name, previous } })
    await bumpCacheGeneration(ctx.cache)
  }

  return jsonOk({ versions: await listGameVersions(ctx.db) }, { requestId: ctx.requestId })
})
