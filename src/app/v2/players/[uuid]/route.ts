import { parseBoolean, validationError } from "@/lib/server/http"
import { buildPlayerDetail } from "@/lib/server/services/player-service"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid) && uuid !== "0") {
    return validationError("Invalid player uuid", ctx.requestId)
  }

  const url = new URL(ctx.request.url)
  const include = new Set(
    String(url.searchParams.get("include") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )

  const includePbs = include.has("pbs") || parseBoolean(url.searchParams.get("include_pbs"), false)
  const includeRecentSubmissions = include.has("recent_submissions")
  const submissionsLimit = Math.max(1, Math.min(50, Number(url.searchParams.get("submissions_limit") || "10")))

  const key = await cacheKey(ctx.cache, "players", uuid, includePbs ? 1 : 0, includeRecentSubmissions ? 1 : 0, submissionsLimit)
  const { value: detail } = await readThroughCache(ctx.cache, key, 60, () =>
    buildPlayerDetail(ctx.db, uuid, { includePbs, includeRecentSubmissions, submissionsLimit })
  )

  return jsonOk({ player: detail ?? null }, { requestId: ctx.requestId })
})
