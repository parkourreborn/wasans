import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import { reorderComboCategories } from "@/lib/server/repositories/combo-category-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Moderator, withV2Context } from "@/lib/server/v2/http"

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Moderator(ctx)

  const body = await ctx.request.json().catch(() => null) as { slugs?: unknown } | null
  const slugs = Array.isArray(body?.slugs) ? body.slugs.filter((slug): slug is string => typeof slug === "string") : null

  if (!slugs || slugs.length === 0) {
    return validationError("slugs must be a non-empty array of category slugs", ctx.requestId)
  }

  await reorderComboCategories(ctx.db, slugs)

  await insertAuditLog(ctx.db, "combo_category_updated", "combo_category", null, {
    actor: user,
    details: { reordered: slugs },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
