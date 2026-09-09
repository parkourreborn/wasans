import { validationError } from "@/lib/server/http"
import { insertAuditLog } from "@/lib/server/audit"
import {
  createAnnouncement,
  listActiveAnnouncementsForViewer,
} from "@/lib/server/repositories/announcement-repository"
import { bumpCacheGeneration } from "@/lib/server/v2/cache"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

// Not cached: the result is per-viewer (dismissals), and this table is tiny,
// so a per-viewer KV cache key would add complexity for no real benefit.
export const GET = withV2Context(async (ctx) => {
  const now = Math.floor(Date.now() / 1000)
  const announcements = await listActiveAnnouncementsForViewer(ctx.db, ctx.auth?.uuid ?? null, now)

  return jsonOk(announcements, { requestId: ctx.requestId })
})

export const POST = withV2Context(async (ctx) => {
  const user = await requireV2Owner(ctx)

  const body = await ctx.request.json().catch(() => null) as {
    body?: unknown
    link_url?: unknown
    expires_at?: unknown
  } | null
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  const linkUrl = typeof body?.link_url === "string" && body.link_url.trim() ? body.link_url.trim() : null
  const expiresAt = typeof body?.expires_at === "number" && Number.isFinite(body.expires_at) ? body.expires_at : null

  if (!text) {
    return validationError("body is required", ctx.requestId)
  }

  const announcement = await createAnnouncement(
    ctx.db,
    { body: text, linkUrl, expiresAt },
    user,
    Math.floor(Date.now() / 1000)
  )

  await insertAuditLog(ctx.db, "announcement_created", "announcement", announcement.uuid, {
    actor: user,
    details: { body: text, link_url: linkUrl, expires_at: expiresAt },
  })

  await bumpCacheGeneration(ctx.cache)

  return jsonOk(announcement, { status: 201, requestId: ctx.requestId })
})
