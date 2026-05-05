import { getCloudflareContext } from "@opennextjs/cloudflare"
import { trials as trialList } from "@/lib/trials"

type LeaderboardPlayer = {
  player_uuid: string
  player_name: string
  overall_score: number
  date_joined: string
}

type LeaderboardTrialRow = {
  player_uuid: string
  player_name: string
  time: number | null
  submission_uuid: string | null
  score: number
}

const cacheHeaders = {
  "cache-control": "max-age=10, stale-while-revalidate=30",
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  if (!env?.wasans) {
    return new Response(JSON.stringify({ error: "DB binding not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  const url = new URL(request.url)
  const trialName = url.searchParams.get("trialName")?.trim() || null

  if (trialName && !trialList.includes(trialName as (typeof trialList)[number])) {
    return new Response(JSON.stringify({ error: "Invalid trial" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  if (trialName) {
    const wr = await env.wasans.prepare(
      `SELECT submission_uuid, time FROM wrs WHERE trial_name = ?`
    )
      .bind(trialName)
      .first<{ submission_uuid: string; time: number }>()

    const { results } = await env.wasans.prepare(
      `SELECT players.uuid as player_uuid,
              players.player_name,
              pbs.time,
              pbs.submission_uuid
       FROM players
       LEFT JOIN pbs ON pbs.player_uuid = players.uuid AND pbs.trial_name = ?
       ORDER BY CASE WHEN pbs.time IS NULL THEN 1 ELSE 0 END, pbs.time ASC, players.player_name ASC`
    )
      .bind(trialName)
      .all<LeaderboardTrialRow>()

    const rows = (results || []).map((row, index) => ({
      ...row,
      rank: row.time ? index + 1 : null,
      score: row.time && wr?.time ? Number((Math.pow(wr.time / row.time, 3)).toFixed(3)) : 0,
      submission_uuid: row.submission_uuid || null,
      is_world_record: row.time === wr?.time,
      wr_submission_uuid: wr?.submission_uuid || null,
    }))

    return new Response(JSON.stringify({ results: rows, wr }), {
      status: 200,
      headers: {
        ...cacheHeaders,
        "content-type": "application/json",
      },
    })
  }

  const { results } = await env.wasans.prepare(
    `SELECT uuid as player_uuid, player_name, score as overall_score, date_joined
     FROM players
     ORDER BY score DESC, player_name ASC`
  ).all<LeaderboardPlayer>()

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: {
      ...cacheHeaders,
      "content-type": "application/json",
    },
  })
}
