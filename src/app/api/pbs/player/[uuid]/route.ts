import { getCloudflareContext } from "@opennextjs/cloudflare"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const { results } = await env.wasans.prepare(
    `SELECT trial_name, time, submission_uuid, date
     FROM pbs
     WHERE player_uuid = ?
     ORDER BY trial_name`
  )
    .bind(uuid)
    .all()

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })
}