import { dismissAnnouncement } from "@/lib/server/repositories/announcement-repository"
import { jsonOk, requireV2User, withV2Params } from "@/lib/server/v2/http"

export const POST = withV2Params<{ uuid: string }>(async (ctx, { uuid }) => {
  const user = await requireV2User(ctx)

  await dismissAnnouncement(ctx.db, uuid, user.uuid, Math.floor(Date.now() / 1000))

  return jsonOk({ ok: true }, { requestId: ctx.requestId })
})
