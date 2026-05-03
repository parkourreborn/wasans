import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(_: Request, { params }: { params: Promise<{ trial: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { trial } = await params;

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