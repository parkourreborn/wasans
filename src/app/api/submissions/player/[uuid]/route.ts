import { getCloudflareContext } from "@opennextjs/cloudflare"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "50")))
  const offset = (page - 1) * limit
  const approvedOnly = url.searchParams.get("approvedOnly") === "true"

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const whereClause = approvedOnly ? "AND submissions.state = 'approved'" : ""
  const { results } = await env.wasans.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.player_uuid = ?
     ${whereClause}
     ORDER BY submissions.date DESC
     LIMIT ? OFFSET ?`
  )
    .bind(uuid, limit, offset)
    .all()

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })
}
