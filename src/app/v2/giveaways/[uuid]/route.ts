import { jsonError } from "@/lib/server/http"
import {
  countGiveawayEntries,
  getGiveaway,
  hasPlayerEnteredGiveaway,
  listCurrentGiveawayWinners,
} from "@/lib/server/repositories/giveaway-repository"
import { cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, withV2Params } from "@/lib/server/v2/http"

export const GET = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const key = await cacheKey(ctx.cache, "giveaway", uuid)
  const { value } = await readThroughCache(ctx.cache, key, 60, async () => {
    const giveaway = await getGiveaway(ctx.db, uuid)
    if (!giveaway) {
      return null
    }
    const [winners, entryCount] = await Promise.all([
      listCurrentGiveawayWinners(ctx.db, uuid),
      countGiveawayEntries(ctx.db, uuid),
    ])
    return { giveaway, winners, entry_count: entryCount }
  })

  if (!value) {
    return jsonError(`Giveaway "${uuid}" was not found`, 404, { code: "not_found", requestId: ctx.requestId })
  }

  // Viewer-specific and therefore not part of the cached payload.
  const hasJoined = ctx.auth ? await hasPlayerEnteredGiveaway(ctx.db, uuid, ctx.auth.uuid) : false

  return jsonOk({ ...value, viewer_has_joined: hasJoined }, { requestId: ctx.requestId })
})
