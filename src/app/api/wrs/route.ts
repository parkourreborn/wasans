import { getCloudflareContext } from "@opennextjs/cloudflare"
import { refreshWorldRecords } from "@/lib/server/wrs"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const countRow = await env.wasans
    .prepare(`SELECT COUNT(1) AS count FROM wrs`)
    .first<{ count: number }>()

  const count = Number(countRow?.count ?? 0)
  if (count === 0) {
    await refreshWorldRecords(env.wasans)
  }

  const { results } = await env.wasans.prepare(
    `SELECT wrs.*, players.score AS player_score
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     ORDER BY wrs.trial_name`
  ).all()

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })
}
