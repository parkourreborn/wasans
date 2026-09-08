import "server-only"

export type ComboSubmissionRow = {
  uuid: string
  player_uuid: string
  category_slug: string
  player_name: string
  combo_count: number
  youtube_url: string
  date: number
  moderator_note: string | null
  moderator_username: string | null
  state: string
}

export type ComboSubmissionWithPlayerRow = ComboSubmissionRow & {
  player_id: string | null
  discord_avatar: string | null
  discord_discriminator: string | null
}

export type ComboPlayerContext = {
  uuid: string
  player_id: string
  player_name: string
}

export type ComboPbRow = {
  player_uuid: string
  category_slug: string
  submission_uuid: string
  player_name: string
  combo_count: number
  date: number
}

export async function listComboSubmissions(
  db: D1Database,
  options: {
    limit: number
    offset: number
    state?: string | null
    category?: string | null
    playerUuid?: string | null
    search?: string
  }
) {
  const whereConditions: string[] = ["COALESCE(players.account_status, 'active') != 'deactivated'"]
  const bindValues: (string | number)[] = []

  if (options.state && ["approved", "denied", "pending"].includes(options.state)) {
    whereConditions.push("combo_submissions.state = ?")
    bindValues.push(options.state)
  }

  if (options.category) {
    whereConditions.push("combo_submissions.category_slug = ?")
    bindValues.push(options.category)
  }

  if (options.playerUuid) {
    whereConditions.push("combo_submissions.player_uuid = ?")
    bindValues.push(options.playerUuid)
  }

  if (options.search) {
    whereConditions.push("(LOWER(combo_submissions.category_slug) LIKE ? OR LOWER(combo_submissions.player_name) LIKE ?)")
    bindValues.push(`%${options.search.toLowerCase()}%`, `%${options.search.toLowerCase()}%`)
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

  const countResult = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM combo_submissions
     LEFT JOIN players ON players.uuid = combo_submissions.player_uuid
     ${whereClause}`
  )
    .bind(...bindValues)
    .first<{ count: number }>()

  const rows = await db.prepare(
    `SELECT combo_submissions.*, players.player_id, players.discord_avatar, players.discord_discriminator
     FROM combo_submissions
     LEFT JOIN players ON players.uuid = combo_submissions.player_uuid
     ${whereClause}
     ORDER BY combo_submissions.date DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindValues, options.limit, options.offset)
    .all<ComboSubmissionWithPlayerRow>()

  return {
    results: rows.results || [],
    total: Number(countResult?.count ?? 0),
  }
}

export async function findComboPlayerByUuid(db: D1Database, playerUuid: string) {
  return db.prepare(
    `SELECT uuid, player_id, player_name
     FROM players
     WHERE uuid = ?
       AND COALESCE(account_status, 'active') = 'active'`
  )
    .bind(playerUuid)
    .first<ComboPlayerContext>()
}

export async function createComboSubmission(
  db: D1Database,
  submission: {
    uuid: string
    playerUuid: string
    categorySlug: string
    playerName: string
    comboCount: number
    youtubeUrl: string
    now: number
  }
) {
  await db.prepare(
    `INSERT INTO combo_submissions (
      uuid, player_uuid, category_slug, player_name, combo_count, youtube_url, date, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      submission.uuid,
      submission.playerUuid,
      submission.categorySlug,
      submission.playerName,
      submission.comboCount,
      submission.youtubeUrl,
      submission.now,
      "pending"
    )
    .run()
}

export async function getComboSubmissionWithPlayer(db: D1Database, uuid: string) {
  const { results } = await db.prepare(
    `SELECT combo_submissions.*, players.player_id, players.discord_avatar, players.discord_discriminator
     FROM combo_submissions
     LEFT JOIN players ON players.uuid = combo_submissions.player_uuid
     WHERE combo_submissions.uuid = ?`
  )
    .bind(uuid)
    .all<ComboSubmissionWithPlayerRow>()

  return (results || [])[0] || null
}

export async function getComboSubmissionBase(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT uuid, player_uuid, category_slug, player_name, combo_count, youtube_url, date, moderator_note, moderator_username, state
     FROM combo_submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<ComboSubmissionRow>()
}

export async function updateComboSubmissionByUuid(
  db: D1Database,
  uuid: string,
  updates: Array<{ field: "state" | "moderator_note" | "moderator_username"; value: string | null }>
) {
  if (!updates.length) {
    return
  }

  const clauses = updates.map((update) => `${update.field} = ?`)
  const values = updates.map((update) => update.value)

  await db.prepare(`UPDATE combo_submissions SET ${clauses.join(", ")} WHERE uuid = ?`)
    .bind(...values, uuid)
    .run()
}

export async function getComboSubmissionDeleteContext(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT uuid, player_uuid, category_slug, state
     FROM combo_submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<{ uuid: string; player_uuid: string; category_slug: string; state: string }>()
}

// combo_pbs rows for this submission are removed automatically by
// ON DELETE CASCADE (see migrations/0007_combos.sql) -- no need to delete
// them by hand here. Callers still need to call refreshComboPb afterwards
// so the next-best approved submission (if any) takes over the PB slot.
export async function deleteComboSubmissionCascade(db: D1Database, uuid: string) {
  await db.prepare(`DELETE FROM combo_submissions WHERE uuid = ?`).bind(uuid).run()
}

export async function listComboPbsForPlayer(db: D1Database, playerUuid: string) {
  const { results } = await db.prepare(
    `SELECT combo_pbs.player_uuid, combo_pbs.category_slug, combo_pbs.submission_uuid,
            combo_pbs.player_name, combo_pbs.combo_count, combo_pbs.date
     FROM combo_pbs
     LEFT JOIN combo_categories ON combo_categories.slug = combo_pbs.category_slug
     WHERE combo_pbs.player_uuid = ?
     ORDER BY combo_categories.sort_order ASC, combo_pbs.category_slug ASC`
  )
    .bind(playerUuid)
    .all<ComboPbRow>()

  return results || []
}

// Single-row recompute: finds this player's best approved submission for the
// category (combo_count DESC, date ASC, uuid ASC — matching the leaderboard's
// tie-break) and upserts combo_pbs to match, or removes the row entirely if
// no approved submission remains. Only ever touches one row, so — unlike the
// trial WR/score fan-out — this runs synchronously in the request instead of
// via ctx.waitUntil.
export async function refreshComboPb(db: D1Database, playerUuid: string, categorySlug: string) {
  const best = await db.prepare(
    `SELECT uuid, player_name, combo_count, date
     FROM combo_submissions
     WHERE player_uuid = ? AND category_slug = ? AND state = 'approved'
     ORDER BY combo_count DESC, date ASC, uuid ASC
     LIMIT 1`
  )
    .bind(playerUuid, categorySlug)
    .first<{ uuid: string; player_name: string; combo_count: number; date: number }>()

  if (!best) {
    await db.prepare(`DELETE FROM combo_pbs WHERE player_uuid = ? AND category_slug = ?`)
      .bind(playerUuid, categorySlug)
      .run()
    return
  }

  await db.prepare(
    `INSERT INTO combo_pbs (player_uuid, category_slug, submission_uuid, player_name, combo_count, date)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_uuid, category_slug) DO UPDATE SET
       submission_uuid = excluded.submission_uuid,
       player_name = excluded.player_name,
       combo_count = excluded.combo_count,
       date = excluded.date`
  )
    .bind(playerUuid, categorySlug, best.uuid, best.player_name, best.combo_count, best.date)
    .run()
}
