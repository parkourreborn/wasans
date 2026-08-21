import "server-only"

export type SubmissionRow = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  state: string
  time: number
  date: number
  moderator_note: string | null
  moderator_username: string | null
  thread_id: string | null
}

export type SubmissionWithScoreRow = SubmissionRow & {
  player_score: number | string
  player_id: string | null
  discord_avatar: string | null
  discord_discriminator: string | null
}

export type PlayerSubmissionContext = {
  uuid: string
  player_id: string
  player_name: string
  score: number | string | null
}

export async function listSubmissions(
  db: D1Database,
  options: {
    limit: number
    offset: number
    state?: string | null
    playerUuid?: string | null
    search?: string
  }
) {
  const whereConditions: string[] = ["COALESCE(players.account_status, 'active') != 'deactivated'"]
  const bindValues: (string | number)[] = []

  if (options.state && ["approved", "denied", "pending"].includes(options.state)) {
    whereConditions.push("submissions.state = ?")
    bindValues.push(options.state)
  }

  if (options.playerUuid) {
    whereConditions.push("submissions.player_uuid = ?")
    bindValues.push(options.playerUuid)
  }

  if (options.search) {
    whereConditions.push("(LOWER(submissions.trial_name) LIKE ? OR LOWER(submissions.player_name) LIKE ?)")
    bindValues.push(`%${options.search.toLowerCase()}%`, `%${options.search.toLowerCase()}%`)
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

  const countResult = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     ${whereClause}`
  )
    .bind(...bindValues)
    .first<{ count: number }>()

  const rows = await db.prepare(
    `SELECT submissions.*, players.score as player_score, players.player_id, players.discord_avatar, players.discord_discriminator
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     ${whereClause}
     ORDER BY submissions.date DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindValues, options.limit, options.offset)
    .all<SubmissionWithScoreRow>()

  return {
    results: rows.results || [],
    total: Number(countResult?.count ?? 0),
  }
}

export async function findPlayerByUuid(db: D1Database, playerUuid: string) {
  return db.prepare(
    `SELECT uuid, player_id, player_name, score
     FROM players
     WHERE uuid = ?
       AND COALESCE(account_status, 'active') = 'active'`
  )
    .bind(playerUuid)
    .first<PlayerSubmissionContext>()
}

export async function findPersonalBestByTrials(db: D1Database, playerUuid: string, trials: string[]) {
  if (!trials.length) {
    return new Map<string, number>()
  }

  const placeholders = trials.map(() => "?").join(",")
  const { results } = await db.prepare(
    `SELECT trial_name, MIN(time) AS time
     FROM submissions
     WHERE player_uuid = ?
       AND state != 'denied'
       AND trial_name IN (${placeholders})
     GROUP BY trial_name`
  )
    .bind(playerUuid, ...trials)
    .all<{ trial_name: string; time: number }>()

  return new Map((results || []).map((row) => [row.trial_name, Number(row.time)]))
}

export async function createSubmission(
  db: D1Database,
  submission: {
    uuid: string
    playerUuid: string
    trialName: string
    playerName: string
    time: number
    now: number
    trialVersion: number
  }
) {
  await db.prepare(
    `INSERT INTO submissions (
      uuid, player_uuid, trial_name, player_name, time, date, state, trial_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      submission.uuid,
      submission.playerUuid,
      submission.trialName,
      submission.playerName,
      submission.time,
      submission.now,
      "pending",
      submission.trialVersion
    )
    .run()
}

export async function setSubmissionThreadId(db: D1Database, submissionUuid: string, threadId: string) {
  await db.prepare(`UPDATE submissions SET thread_id = ? WHERE uuid = ?`)
    .bind(threadId, submissionUuid)
    .run()
}

export async function getSubmissionWithScore(db: D1Database, uuid: string) {
  const { results } = await db.prepare(
    `SELECT submissions.*, players.score as player_score
     FROM submissions
     LEFT JOIN players ON players.uuid = submissions.player_uuid
     WHERE submissions.uuid = ?`
  )
    .bind(uuid)
    .all<SubmissionWithScoreRow>()

  return (results || [])[0] || null
}

export async function getSubmissionBase(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT uuid, player_uuid, trial_name, player_name, state, time, date, moderator_note, moderator_username, thread_id
     FROM submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow>()
}

export async function updateSubmissionByUuid(
  db: D1Database,
  uuid: string,
  updates: Array<{ field: "state" | "moderator_note" | "time" | "moderator_username"; value: string | number | null }>
) {
  if (!updates.length) {
    return
  }

  const clauses = updates.map((update) => `${update.field} = ?`)
  const values = updates.map((update) => update.value)

  await db.prepare(`UPDATE submissions SET ${clauses.join(", ")} WHERE uuid = ?`)
    .bind(...values, uuid)
    .run()
}

// Combines what used to be two sequential round trips (getPlayerScoreContext
// + getPbContext) into one D1 batch — both are independent single-row reads
// keyed off values already known to the caller.
export async function getPlayerScoreAndPbContext(db: D1Database, playerUuid: string, trialName: string) {
  const [playerResult, pbResult] = await db.batch([
    db.prepare(`SELECT score, player_id FROM players WHERE uuid = ?`).bind(playerUuid),
    db.prepare(`SELECT time FROM pbs WHERE player_uuid = ? AND trial_name = ?`).bind(playerUuid, trialName),
  ])

  return {
    player: (playerResult.results[0] as { score: number; player_id: string } | undefined) ?? null,
    pb: (pbResult.results[0] as { time: number } | undefined) ?? null,
  }
}

// wrs/pbs rows for this submission are removed automatically by
// ON DELETE CASCADE (see migrations/0004_schema_rebuild.sql) -- no need to
// delete them by hand here.
export async function deleteSubmissionCascade(db: D1Database, uuid: string) {
  await db.prepare(`DELETE FROM submissions WHERE uuid = ?`).bind(uuid).run()
}

export async function getSubmissionDeleteContext(db: D1Database, uuid: string) {
  return db.prepare(
    `SELECT s.uuid, s.player_uuid, s.trial_name, s.thread_id, w.trial_name AS wr_trial
     FROM submissions s
     LEFT JOIN wrs w ON w.submission_uuid = s.uuid
     WHERE s.uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionRow & { wr_trial: string | null }>()
}
