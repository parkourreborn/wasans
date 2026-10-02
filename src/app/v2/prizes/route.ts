import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import {
  createPrize,
  listPrizes,
  PrizeError,
  type PrizeCriteriaType,
} from "@/lib/server/repositories/prize-repository"
import { bumpCacheGeneration, cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

const CRITERIA_TYPES: PrizeCriteriaType[] = ["trial_wr", "combo_wr", "rankup", "score_reached"]

export const GET = withV2Context(async (ctx) => {
  const filterParam = new URL(ctx.request.url).searchParams.get("filter")
  const filter = filterParam === "history" ? "history" : "active"

  const key = await cacheKey(ctx.cache, "prizes", filter)
  const { value } = await readThroughCache(ctx.cache, key, 60, () => listPrizes(ctx.db, filter))

  return jsonOk(value, { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as {
    title?: unknown
    description?: unknown
    criteria_type?: unknown
    criteria_trial_name?: unknown
    criteria_combo_category_slug?: unknown
    criteria_target_role_id?: unknown
    criteria_score_target?: unknown
    max_winners?: unknown
    ends_at?: unknown
  } | null

  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const criteriaType = CRITERIA_TYPES.includes(body?.criteria_type as PrizeCriteriaType)
    ? (body?.criteria_type as PrizeCriteriaType)
    : null

  if (!title || !criteriaType) {
    return validationError("title and a valid criteria_type are required", ctx.requestId)
  }

  try {
    const prize = await createPrize(
      ctx.db,
      {
        title,
        description: typeof body?.description === "string" ? body.description : null,
        criteriaType,
        criteriaTrialName: typeof body?.criteria_trial_name === "string" ? body.criteria_trial_name : null,
        criteriaComboCategorySlug: typeof body?.criteria_combo_category_slug === "string" ? body.criteria_combo_category_slug : null,
        criteriaTargetRoleId: typeof body?.criteria_target_role_id === "string" ? body.criteria_target_role_id : null,
        criteriaScoreTarget: typeof body?.criteria_score_target === "number" ? body.criteria_score_target : null,
        maxWinners: typeof body?.max_winners === "number" ? body.max_winners : null,
        endsAt: typeof body?.ends_at === "number" ? body.ends_at : null,
      },
      user,
      Math.floor(Date.now() / 1000)
    )

    await insertAuditLog(ctx.db, "prize_created", "prize", prize.uuid, {
      actor: user,
      details: { title, criteria_type: criteriaType },
    })

    await bumpCacheGeneration(ctx.cache)

    return jsonOk(prize, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof PrizeError) {
      return jsonError(error.message, 400, { code: "validation_error", requestId: ctx.requestId })
    }
    throw error
  }
})
