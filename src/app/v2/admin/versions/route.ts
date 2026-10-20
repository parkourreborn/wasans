import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { addGameVersion, listGameVersions, removeUnusedGameVersion } from "@/lib/server/repositories/game-version-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"
import { normalizeVersionName } from "@/lib/wr-archive"

// The game versions owners keep for runs, highest first. New runs are
// stamped with the current one; the WR archive names files by them.
export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)
  return jsonOk({ versions: await listGameVersions(ctx.db) }, { requestId: ctx.requestId })
})

// { name, current } — `current: true` also makes it the one new runs get
// (a new game update); false adds an old one, e.g. for an old world record.
export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  const body = (await ctx.request.json().catch(() => null)) as { name?: unknown; current?: unknown } | null
  const name = normalizeVersionName(body?.name)
  if (!name) {
    return validationError("A version is up to 32 letters, numbers, spaces, dots, dashes, underscores or pluses", ctx.requestId)
  }
  const current = body?.current === true

  if (!(await addGameVersion(ctx.db, name, user.player_name, Math.floor(Date.now() / 1000), { current }))) {
    throw new ApiError(`${name} is already on the list`, 409, "conflict")
  }
  await insertAuditLog(ctx.db, "game_version_added", "game_version", name, { actor: user, details: { name, current } })
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ versions: await listGameVersions(ctx.db) }, { status: 201, requestId: ctx.requestId })
})

// DELETE ?name=… — only a version no run has yet, and not the current one.
export const DELETE = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)
  const name = new URL(ctx.request.url).searchParams.get("name") ?? ""

  if (!(await removeUnusedGameVersion(ctx.db, name))) {
    const version = (await listGameVersions(ctx.db)).find((entry) => entry.name === name)
    if (!version) {
      throw new ApiError("That version isn't on the list", 404, "not_found")
    }
    if (version.is_current) {
      throw new ApiError("New runs get this version. Make another one current first.", 409, "conflict")
    }
    throw new ApiError(`${version.run_count} ${version.run_count === 1 ? "run has" : "runs have"} this version, so it can't be removed`, 409, "conflict")
  }
  await insertAuditLog(ctx.db, "game_version_removed", "game_version", name, { actor: user, details: { name } })
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ versions: await listGameVersions(ctx.db) }, { requestId: ctx.requestId })
})
