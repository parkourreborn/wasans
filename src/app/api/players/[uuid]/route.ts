import { getCloudflareContext } from "@opennextjs/cloudflare"

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(_: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { uuid } = await params;

  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const player = await env.wasans.prepare(`SELECT * FROM players WHERE uuid = ?`)
    .bind(uuid)
    .first()

  if (!player) {
    return new Response(JSON.stringify({ player: null }), {
      status: 200,
      headers: {
        ...cacheHeaders,
        "content-type": "application/json",
      },
    })
  }

  const rankResult = await env.wasans.prepare(
    `SELECT COUNT(*) + 1 as rank FROM players WHERE score > ?`
  )
    .bind(player.score)
    .first<{ rank: number }>()

  const playerWithRank = {
    ...player,
    rank: rankResult?.rank || 1,
  }

  return new Response(JSON.stringify({ player: playerWithRank }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })

}