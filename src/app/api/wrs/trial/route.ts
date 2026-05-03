import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const trial = new URL(request.url).searchParams.get("trial")

  if (!trial) {
    return new Response(JSON.stringify({ error: "Missing trial query parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(`SELECT * FROM wrs WHERE trial = ?`)
    .bind(trial)
    .run()

  return Response.json({ results })
}
