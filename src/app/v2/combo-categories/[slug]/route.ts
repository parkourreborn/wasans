import { jsonError, validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import {
  ComboCategoryError,
  renameComboCategory,
  setComboCategoryStatus,
  type ComboCategoryStatus,
} from "@/lib/server/repositories/combo-category-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2ComboModerator, withV2Params } from "@/lib/server/v2/http"

export const PATCH = withV2Params<{ slug: string }>(async (ctx, { slug }) => {
  const user = await requireV2ComboModerator(ctx)

  const body = await ctx.request.json().catch(() => null) as { label?: unknown; status?: unknown } | null
  const label = typeof body?.label === "string" ? body.label.trim() : undefined
  const status = body?.status === "active" || body?.status === "disabled" ? (body.status as ComboCategoryStatus) : undefined

  if (label === undefined && status === undefined) {
    return validationError("label or status must be provided", ctx.requestId)
  }

  try {
    let category = null

    if (label !== undefined) {
      category = await renameComboCategory(ctx.db, slug, label)
    }

    if (status !== undefined) {
      category = await setComboCategoryStatus(ctx.db, slug, status)
    }

    await insertAuditLog(ctx.db, "combo_category_updated", "combo_category", slug, {
      actor: user,
      details: { slug, ...(label !== undefined ? { label } : {}), ...(status !== undefined ? { status } : {}) },
    })

    await bumpCacheGeneration(ctx.cache)

    return jsonOk(category, { requestId: ctx.requestId })
  } catch (error) {
    if (error instanceof ComboCategoryError) {
      return jsonError(error.message, error.code === "not_found" ? 404 : 400, {
        code: error.code === "not_found" ? "not_found" : "validation_error",
        requestId: ctx.requestId,
      })
    }
    throw error
  }
})
