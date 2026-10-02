import { listAllAnnouncements } from "@/lib/server/repositories/announcement-repository"
import { jsonOk, requireV2Owner, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  await requireV2Owner(ctx)

  const announcements = await listAllAnnouncements(ctx.db)
  return jsonOk(announcements, { requestId: ctx.requestId })
})
