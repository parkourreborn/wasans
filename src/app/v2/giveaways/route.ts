import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { createGiveaway, GiveawayError, listGiveaways } from "@/lib/server/repositories/giveaway-repository"
import { bumpCacheGeneration, cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const filterParam = new URL(ctx.request.url).searchParams.get("filter")
  const filter = filterParam === "history" ? "history" : "active"

  const key = await cacheKey(ctx.cache, "giveaways", filter)
  const { value } = await readThroughCache(ctx.cache, key, 60, () => listGiveaways(ctx.db, filter))

  return jsonOk(value, { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as {
    title?: unknown
    description?: unknown
    max_winners?: unknown
    ends_at?: unknown
  } | null

  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const maxWinners = typeof body?.max_winners === "number" ? body.max_winners : NaN
  const endsAt = typeof body?.ends_at === "number" ? body.ends_at : NaN

  if (!title || !Number.isFinite(maxWinners) || !Number.isFinite(endsAt)) {
    return validationError("title, max_winners, and ends_at are required", ctx.requestId)
  }

  try {
    const giveaway = await createGiveaway(
      ctx.db,
      { title, description: typeof body?.description === "string" ? body.description : null, maxWinners, endsAt },
      user,
      Math.floor(Date.now() / 1000)
    )

    await insertAuditLog(ctx.db, "giveaway_created", "giveaway", giveaway.uuid, {
      actor: user,
      details: { title, max_winners: maxWinners, ends_at: endsAt },
    })
    await bumpCacheGeneration(ctx.cache)

    return jsonOk(giveaway, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof GiveawayError) {
      return jsonError(error.message, 400, { code: "validation_error", requestId: ctx.requestId })
    }
    throw error
  }
})
