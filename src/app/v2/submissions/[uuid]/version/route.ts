import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { gameVersionExists, setSubmissionGameVersion } from "@/lib/server/repositories/game-version-repository"
import { archiveRun, getWorldRecordRun } from "@/lib/server/services/wr-archive-service"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { ApiError, jsonOk, requireV2Owner, withV2Params } from "@/lib/server/v2/http"

// Owners set the game version a run was played on. Nothing is posted to or
// edited in Discord. A world record's archived original is renamed to match
// right away, which streams the file once, so this can take a few seconds.
export const PATCH = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2Owner(ctx)
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) {
    return validationError("Invalid submission uuid", ctx.requestId)
  }

  const body = (await ctx.request.json().catch(() => null)) as { version?: unknown } | null
  const version = typeof body?.version === "string" ? body.version : ""
  if (!(await gameVersionExists(ctx.db, version))) {
    return validationError("Pick a version from the list in /admin/site", ctx.requestId)
  }

  const submission = await ctx.db
    .prepare(`SELECT trial_name, time, player_uuid, game_version FROM submissions WHERE uuid = ?`)
    .bind(uuid)
    .first<{ trial_name: string; time: number; player_uuid: string; game_version: string | null }>()
  if (!submission) {
    throw new ApiError("Submission was not found", 404, "not_found")
  }

  if (submission.game_version !== version) {
    await setSubmissionGameVersion(ctx.db, uuid, version)
    await insertAuditLog(ctx.db, "submission_version_changed", "submission", uuid, {
      actor: user,
      details: { trial_name: submission.trial_name, time: submission.time, old_version: submission.game_version, new_version: version },
    })
  }

  const record = ctx.env.UPLOADS && ctx.env.SUBMISSION_VIDEOS ? await getWorldRecordRun(ctx.db, uuid) : null
  let archive: "archived" | "unchanged" | "missing" | "failed" | null = null
  if (record) {
    try {
      archive = await archiveRun(ctx.env, ctx.db, record)
    } catch (error) {
      // The version is saved either way; the daily sweep renames the file.
      console.error(`Archiving ${uuid} failed:`, error)
      archive = "failed"
    }
  }
  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ uuid, game_version: version, archive }, { requestId: ctx.requestId })
})
