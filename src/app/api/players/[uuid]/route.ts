import { getCloudflareContext } from "@opennextjs/cloudflare"
import { refreshPlayerScore } from "@/lib/server/player-scores"
import { refreshPlayerPbs } from "@/lib/server/pbs"

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

  // Check if the stored score is outdated and refresh if needed
  const currentScore = await refreshPlayerScore(env.wasans, uuid, { skipDiscordUpdate: true })
  const storedScore = Number(player.score)
  
  // If scores don't match (allowing for small floating point differences), the stored score was wrong
  if (Math.abs(currentScore - storedScore) > 0.001) {
    // Score was outdated, refresh PB cache first, then recalculate
    await refreshPlayerPbs(env.wasans, uuid)
    const refreshedScore = await refreshPlayerScore(env.wasans, uuid, { skipDiscordUpdate: true })
    
    // Refetch the player with updated score
    const updatedPlayer = await env.wasans.prepare(`SELECT * FROM players WHERE uuid = ?`)
      .bind(uuid)
      .first()
    if (updatedPlayer) {
      player.score = updatedPlayer.score
    }
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