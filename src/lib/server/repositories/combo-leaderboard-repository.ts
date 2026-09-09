import "server-only"

export type ComboLeaderboardRow = {
  player_uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
  player_name: string
  combo_count: number | null
  submission_uuid: string | null
  date: number | null
}

// Structurally a direct port of listTrialLeaderboard (leaderboard-repository.ts),
// swapping pbs/wrs for combo_pbs. There is no combo "world record" concept
// carried through here — the leaderboard is just combo_pbs ranked by
// combo_count DESC, date ASC, player_name ASC, matching idx_combo_pbs_category_slug.
export async function listComboLeaderboard(db: D1Database, categorySlug: string, limit: number, offset: number) {
  const [countResult, rows] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM players
       WHERE COALESCE(account_status, 'active') != 'deactivated'`
    ),
    db.prepare(
      `SELECT players.uuid AS player_uuid,
              players.player_id,
              players.discord_avatar,
              players.discord_discriminator,
              players.auth_provider,
              players.player_name,
              combo_pbs.combo_count,
              combo_pbs.submission_uuid,
              combo_pbs.date
       FROM players
       LEFT JOIN combo_pbs ON combo_pbs.player_uuid = players.uuid AND combo_pbs.category_slug = ?
       WHERE COALESCE(players.account_status, 'active') != 'deactivated'
       ORDER BY CASE WHEN combo_pbs.combo_count IS NULL THEN 1 ELSE 0 END,
                combo_pbs.combo_count DESC, combo_pbs.date ASC, players.player_name ASC
       LIMIT ? OFFSET ?`
    ).bind(categorySlug, limit, offset),
  ])

  const count = countResult.results[0] as { count: number } | undefined
  const typedRows = rows.results as ComboLeaderboardRow[] | undefined

  const results = (typedRows || []).map((row, index) => ({
    ...row,
    rank: row.combo_count != null ? offset + index + 1 : null,
  }))

  return {
    results,
    total: Number(count?.count ?? 0),
  }
}
