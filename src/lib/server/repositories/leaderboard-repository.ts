import "server-only"

export async function listOverallLeaderboard(db: D1Database, limit: number, offset: number) {
  const [countResult, rows] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM players
       WHERE COALESCE(account_status, 'active') != 'deactivated'`
    ),
    db.prepare(
      `SELECT uuid AS player_uuid, player_id, discord_avatar, discord_discriminator, auth_provider,
              discord_id, (avatar_roblox_id IS NOT NULL) AS has_roblox_avatar, player_name, score AS overall_score, date_joined
       FROM players
       WHERE COALESCE(account_status, 'active') != 'deactivated'
       ORDER BY score DESC, player_name ASC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset),
  ])

  const count = (countResult.results[0] as { count: number } | undefined)

  return {
    results: rows.results || [],
    total: Number(count?.count ?? 0),
  }
}

// Only players with a personal best on the trial are listed (and counted),
// fastest first. rank is shared on equal times: two players on 12.345 are
// both #3 and the next is #5.
export async function listTrialLeaderboard(db: D1Database, trialName: string, limit: number, offset: number) {
  type TrialLeaderboardRow = {
    player_uuid: string
    player_id: string
    discord_avatar?: string | null
    discord_discriminator?: string | null
    auth_provider?: string | null
    discord_id?: string | null
    has_roblox_avatar?: number | null
    player_name: string
    time: number
    submission_uuid: string
    date: number
    rank: number
  }

  const [wrResult, countResult, rows] = await db.batch([
    db.prepare(`SELECT submission_uuid, time FROM wrs WHERE trial_name = ?`).bind(trialName),
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM pbs
       JOIN players ON players.uuid = pbs.player_uuid
       WHERE pbs.trial_name = ?
         AND COALESCE(players.account_status, 'active') != 'deactivated'`
    ).bind(trialName),
    db.prepare(
      `SELECT players.uuid AS player_uuid,
              players.player_id,
              players.discord_avatar,
              players.discord_discriminator,
              players.auth_provider,
              players.discord_id,
              (players.avatar_roblox_id IS NOT NULL) AS has_roblox_avatar,
              players.player_name,
              pbs.time,
              pbs.submission_uuid,
              pbs.date,
              RANK() OVER (ORDER BY pbs.time ASC) AS rank
       FROM pbs
       JOIN players ON players.uuid = pbs.player_uuid
       WHERE pbs.trial_name = ?
         AND COALESCE(players.account_status, 'active') != 'deactivated'
       ORDER BY pbs.time ASC, players.player_name ASC
       LIMIT ? OFFSET ?`
    ).bind(trialName, limit, offset),
  ])

  const wr = wrResult.results[0] as { submission_uuid: string; time: number } | undefined
  const count = countResult.results[0] as { count: number } | undefined
  const typedRows = rows.results as TrialLeaderboardRow[] | undefined

  const results = (typedRows || []).map((row) => ({
    ...row,
    score: wr?.time ? Number(Math.pow(wr.time / row.time, 3).toFixed(3)) : 0,
    is_world_record: wr?.time != null && Number(row.time) === Number(wr.time),
    wr_submission_uuid: wr?.submission_uuid || null,
  }))

  return {
    wr: wr || null,
    results,
    total: Number(count?.count ?? 0),
  }
}

// One player's standing on a trial, for the "you" row on a trial
// leaderboard: their PB, its shared rank, and its position in the list
// ordering (time, then name) so the page can jump to it. Null without a PB.
export async function getTrialLeaderboardEntry(db: D1Database, trialName: string, playerUuid: string) {
  const row = await db.prepare(
    `SELECT pbs.time,
            pbs.submission_uuid,
            pbs.date,
            (
              SELECT COUNT(*) + 1
              FROM pbs AS faster
              JOIN players AS fp ON fp.uuid = faster.player_uuid
              WHERE faster.trial_name = pbs.trial_name
                AND faster.time < pbs.time
                AND COALESCE(fp.account_status, 'active') != 'deactivated'
            ) AS rank,
            (
              SELECT COUNT(*) + 1
              FROM pbs AS ahead
              JOIN players AS ap ON ap.uuid = ahead.player_uuid
              WHERE ahead.trial_name = pbs.trial_name
                AND (ahead.time < pbs.time OR (ahead.time = pbs.time AND ap.player_name < players.player_name))
                AND COALESCE(ap.account_status, 'active') != 'deactivated'
            ) AS position
     FROM pbs
     JOIN players ON players.uuid = pbs.player_uuid
     WHERE pbs.trial_name = ?
       AND pbs.player_uuid = ?
       AND COALESCE(players.account_status, 'active') != 'deactivated'`
  )
    .bind(trialName, playerUuid)
    .first<{ time: number; submission_uuid: string; date: number; rank: number; position: number }>()

  return row ?? null
}
