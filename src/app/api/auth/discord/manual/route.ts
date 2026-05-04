import { getCloudflareContext } from "@opennextjs/cloudflare"

type PlayerAuthRow = {
  uuid: string
  player_id: string
  player_name: string
  permission: number
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const body = await request.json().catch(() => null) as { discord_user_id?: unknown } | null
  const discordUserId = String(body?.discord_user_id || "").trim()

  if (!/^\d{5,32}$/.test(discordUserId)) {
    return jsonError("Discord user ID is invalid")
  }

  const linkedPlayer = await env.wasans.prepare(
    `SELECT players.uuid, players.player_id, players.player_name, players.permission
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = 'discord'
       AND oauth_accounts.provider_account_id = ?`
  )
    .bind(discordUserId)
    .first<PlayerAuthRow>()

  const player = linkedPlayer ?? await env.wasans.prepare(
    `SELECT uuid, player_id, player_name, permission
     FROM players
     WHERE player_id = ?`
  )
    .bind(discordUserId)
    .first<PlayerAuthRow>()

  if (!player) {
    return jsonError("No player is linked to that Discord user ID", 404)
  }

  const token = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 60 * 60 * 24 * 30

  await env.wasans.prepare(
    `INSERT INTO auth_sessions (token, player_uuid, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(token, player.uuid, String(expiresAt), String(now))
    .run()

  return Response.json(
    { user: player },
    {
      headers: {
        "set-cookie": `wasans_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
      },
    }
  )
}
