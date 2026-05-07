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

  try {
    // Query the wrs table directly - it should be populated by the submission approval process
    const { results } = await env.wasans.prepare(
      `SELECT wrs.*, players.score AS player_score
       FROM wrs
       LEFT JOIN players ON players.uuid = wrs.player_uuid
       ORDER BY wrs.trial_name`
    ).all()

    // If wrs table is empty, refresh it (this should be rare after initial setup)
    if (!results || results.length === 0) {
      try {
        await refreshWorldRecords(env.wasans)
        const retryResults = await env.wasans.prepare(
          `SELECT wrs.*, players.score AS player_score
           FROM wrs
           LEFT JOIN players ON players.uuid = wrs.player_uuid
           ORDER BY wrs.trial_name`
        ).all()
        return new Response(JSON.stringify({ results: retryResults.results || [] }), {
          status: 200,
          headers: {
            ...cacheHeaders,
            "content-type": "application/json",
          },
        })
      } catch (error) {
        console.error("Failed to refresh world records:", error)
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: {
        ...cacheHeaders,
        "content-type": "application/json",
      },
    })
  } catch (error) {
    console.error("Error fetching WRs:", error)
    return new Response(JSON.stringify({ error: "Failed to fetch world records" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }
}