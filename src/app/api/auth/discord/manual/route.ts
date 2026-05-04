import { getCloudflareContext } from "@opennextjs/cloudflare"

type PlayerAuthRow = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
}

type ManualAuthBody = {
  discord_user_id?: unknown
  player_name?: unknown
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function normalizePlayerName(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const playerName = value.trim().replace(/\s+/g, " ")

  if (playerName.length < 2 || playerName.length > 32) {
    return null
  }

  return playerName
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const body = await request.json().catch(() => null) as ManualAuthBody | null
  const discordUserId = String(body?.discord_user_id || "").trim()

  if (!/^\d{5,32}$/.test(discordUserId)) {
    return jsonError("Discord user ID is invalid")
  }

  const linkedPlayer = await env.wasans.prepare(
    `SELECT players.uuid, players.player_id, players.player_name, players.score, players.permission
     FROM oauth_accounts
     JOIN players ON players.uuid = oauth_accounts.player_uuid
     WHERE oauth_accounts.provider = 'discord'
       AND oauth_accounts.provider_account_id = ?`
  )
    .bind(discordUserId)
    .first<PlayerAuthRow>()

  let player = linkedPlayer ?? await env.wasans.prepare(
    `SELECT uuid, player_id, player_name, score, permission
     FROM players
     WHERE player_id = ?`
  )
    .bind(discordUserId)
    .first<PlayerAuthRow>()

  if (!player) {
    const playerName = normalizePlayerName(body?.player_name)

    if (!playerName) {
      return Response.json(
        {
          error: "Username is required for new players",
          needs_player_name: true,
        },
        { status: 404 }
      )
    }

    const playerUuid = crypto.randomUUID()
    const now = String(Math.floor(Date.now() / 1000))

    await env.wasans.prepare(
      `INSERT INTO players (uuid, player_id, player_name, date_joined, permission)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(playerUuid, discordUserId, playerName, now, 0)
      .run()

    await env.wasans.prepare(
      `INSERT OR IGNORE INTO oauth_accounts (
        provider, provider_account_id, player_uuid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
      .bind("discord", discordUserId, playerUuid, now, now)
      .run()

    player = {
      uuid: playerUuid,
      player_id: discordUserId,
      player_name: playerName,
      score: 0,
      permission: 0,
    }
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
