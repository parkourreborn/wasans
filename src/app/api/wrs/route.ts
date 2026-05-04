import { getCloudflareContext } from "@opennextjs/cloudflare"
import { refreshAllPlayerScores } from "@/lib/server/player-scores"
import { refreshWorldRecords } from "@/lib/server/wrs"

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  await refreshWorldRecords(env.wasans)
  await refreshAllPlayerScores(env.wasans)

  const { results } = await env.wasans.prepare(
    `SELECT wrs.*, players.score as player_score
     FROM wrs
     LEFT JOIN players ON players.uuid = wrs.player_uuid
     ORDER BY wrs.trial_name`
  ).all()

  return Response.json({ results })
}
