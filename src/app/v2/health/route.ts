import { jsonOk, withV2Context } from "@/lib/server/v2/http"

export const GET = withV2Context(async (ctx) => {
  const row = await ctx.db.prepare(`SELECT 1 AS ok`).first<{ ok: number }>()

  return jsonOk(
    {
      ok: row?.ok === 1,
      service: "wasans-api",
      version: "v2",
      timestamp: new Date().toISOString(),
    },
    { requestId: ctx.requestId }
  )
})
