import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(
    `SELECT uuid, player_uuid, trial_name, player_name, time, date, state FROM submissions ORDER BY date DESC LIMIT 50`
  ).all()

  return Response.json({ results })
}