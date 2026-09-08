import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import {
  ComboCategoryError,
  createComboCategory,
  listActiveComboCategories,
} from "@/lib/server/repositories/combo-category-repository"
import { bumpCacheGeneration, cacheKey, readThroughCache } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const key = await cacheKey(ctx.cache, "combo-categories", "active-list")
  const { value } = await readThroughCache(ctx.cache, key, 60, () => listActiveComboCategories(ctx.db))

  return jsonOk(value, { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Moderator(ctx)

  const body = await ctx.request.json().catch(() => null) as { slug?: unknown; label?: unknown; sort_order?: unknown } | null
  const slug = typeof body?.slug === "string" ? body.slug.trim() : ""
  const label = typeof body?.label === "string" ? body.label.trim() : ""
  const sortOrder = typeof body?.sort_order === "number" && Number.isFinite(body.sort_order) ? body.sort_order : undefined

  if (!slug || !label) {
    return validationError("slug and label are required", ctx.requestId)
  }

  try {
    const category = await createComboCategory(ctx.db, { slug, label, sortOrder }, Math.floor(Date.now() / 1000))

    await insertAuditLog(ctx.db, "combo_category_created", "combo_category", slug, {
      actor: user,
      details: { slug, label },
    })

    await bumpCacheGeneration(ctx.cache)

    return jsonOk(category, { status: 201, requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof ComboCategoryError) {
      return jsonError(error.message, error.code === "already_exists" ? 409 : 400, {
        code: error.code === "already_exists" ? "conflict" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
