import "server-only"

type TrialRow = {
  name: string
}

type BestSubmissionRow = {
  trial_name: string
  time: number
}

type WorldRecordRow = {
  trial_name: string
  time: number
}

type PlayerRow = {
  uuid: string
}

export async function refreshPlayerScore(db: D1Database, playerUuid: string) {
  const [{ results: trialRows }, { results: bestRows }, { results: wrRows }] = await Promise.all([
    db.prepare(`SELECT name FROM trials`).all<TrialRow>(),
    db.prepare(
      `SELECT trial_name, MIN(time) as time
       FROM submissions
       WHERE player_uuid = ? AND state = 'approved'
       GROUP BY trial_name`
    )
      .bind(playerUuid)
      .all<BestSubmissionRow>(),
    db.prepare(`SELECT trial_name, time FROM wrs`).all<WorldRecordRow>(),
  ])

  const trialCount = trialRows.length

  if (trialCount === 0) {
    await db.prepare(`UPDATE players SET score = ? WHERE uuid = ?`).bind(0, playerUuid).run()
    return 0
  }

  const wrs = new Map(wrRows.map((row) => [row.trial_name, Number(row.time)]))
  let total = 0

  for (const best of bestRows) {
    const wr = wrs.get(best.trial_name)
    const time = Number(best.time)

    if (!wr || !Number.isFinite(wr) || !Number.isFinite(time) || time <= 0) {
      continue
    }

    total += Math.min(0.3 + 0.7 * Math.pow(wr / time, 3), 1)
  }

  const score = Number((total / trialCount).toFixed(3))
  await db.prepare(`UPDATE players SET score = ? WHERE uuid = ?`).bind(score, playerUuid).run()

  return score
}

export async function refreshAllPlayerScores(db: D1Database) {
  const { results } = await db.prepare(`SELECT uuid FROM players`).all<PlayerRow>()

  for (const player of results) {
    await refreshPlayerScore(db, player.uuid)
  }
}
