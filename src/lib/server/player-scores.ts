import "server-only"
import calculateScore from "../calc-score"
import { TrialName } from "../trials"
import { updateDiscordUsernameOnScoreChange } from "./notifications"

type TrialRow = {
  name: string
}

type BestSubmissionRow = {
  trial_name: TrialName
  time: number
}

type WorldRecordRow = {
  trial_name: TrialName
  time: number
}

type PlayerRow = {
  uuid: string
}

type RefreshPlayerScoreOptions = {
  skipDiscordUpdate?: boolean
}

type PlayerScoreRow = {
  uuid: string
  score: number
}

type BestSubmissionRowWithPlayer = BestSubmissionRow & {
  player_uuid: string
}

export async function refreshPlayerScores(
  db: D1Database,
  playerUuids: string[],
  options: RefreshPlayerScoreOptions = {}
) {
  const uniquePlayerUuids = [...new Set(playerUuids.filter(Boolean))]

  if (!uniquePlayerUuids.length) {
    return [] as Array<{ uuid: string; score: number }>
  }

  const placeholders = uniquePlayerUuids.map(() => "?").join(",")
  const [{ results: wrRows }, trialCountRow, { results: pbsRows }, { results: fallbackRows }, { results: currentScoresRows }] = await Promise.all([
    db.prepare(`SELECT trial_name, time FROM wrs`).all<WorldRecordRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM trials`).first<{ count: number }>(),
    db.prepare(`SELECT player_uuid, trial_name, time FROM pbs WHERE player_uuid IN (${placeholders})`).bind(...uniquePlayerUuids).all<BestSubmissionRowWithPlayer>(),
    db.prepare(
      `SELECT player_uuid, trial_name, MIN(time) as time
       FROM submissions
       WHERE player_uuid IN (${placeholders})
         AND state = 'approved'
       GROUP BY player_uuid, trial_name`
    )
      .bind(...uniquePlayerUuids)
      .all<BestSubmissionRowWithPlayer>(),
    db.prepare(`SELECT uuid, score FROM players WHERE uuid IN (${placeholders})`).bind(...uniquePlayerUuids).all<PlayerScoreRow>(),
  ])

  const trialCount = Number(trialCountRow?.count ?? 0)
  const wrs = new Map(wrRows.map((row) => [row.trial_name, Number(row.time)]))
  const pbsByPlayer = new Map<string, BestSubmissionRow[]>()
  const fallbackByPlayer = new Map<string, BestSubmissionRow[]>()
  const currentScoresByPlayer = new Map(currentScoresRows.map((row) => [row.uuid, Number(row.score)]))

  for (const row of pbsRows || []) {
    const existing = pbsByPlayer.get(row.player_uuid) ?? []
    existing.push({ trial_name: row.trial_name, time: Number(row.time) })
    pbsByPlayer.set(row.player_uuid, existing)
  }

  for (const row of fallbackRows || []) {
    const existing = fallbackByPlayer.get(row.player_uuid) ?? []
    existing.push({ trial_name: row.trial_name, time: Number(row.time) })
    fallbackByPlayer.set(row.player_uuid, existing)
  }

  const updates = [] as Array<ReturnType<D1Database["prepare"]>>
  const refreshedPlayers: Array<{ uuid: string; score: number }> = []
  const discordUpdates: Array<Promise<void>> = []

  for (const playerUuid of uniquePlayerUuids) {
    const bestRows = pbsByPlayer.get(playerUuid) ?? fallbackByPlayer.get(playerUuid) ?? []
    let total = 0

    if (trialCount > 0) {
      for (const best of bestRows) {
        const wr = wrs.get(best.trial_name)
        const time = Number(best.time)

        if (!wr || !Number.isFinite(wr) || !Number.isFinite(time) || time <= 0) {
          continue
        }

        total += calculateScore(wr, time, best.trial_name)
      }
    }

    const oldScore = currentScoresByPlayer.get(playerUuid) ?? 0
    const score = Number((total / Math.max(trialCount, 1)).toFixed(3))
    updates.push(db.prepare(`UPDATE players SET score = ? WHERE uuid = ?`).bind(score, playerUuid))
    refreshedPlayers.push({ uuid: playerUuid, score })

    if (trialCount === 0) {
      currentScoresByPlayer.set(playerUuid, 0)
    }

    if (!options.skipDiscordUpdate && oldScore !== score) {
      discordUpdates.push(updateDiscordUsernameOnScoreChange(playerUuid, oldScore))
    }
  }

  if (updates.length > 0) {
    await db.batch(updates)
  }

  if (discordUpdates.length > 0) {
    await Promise.all(discordUpdates)
  }

  return refreshedPlayers
}

export async function refreshPlayerScore(
  db: D1Database,
  playerUuid: string,
  options: RefreshPlayerScoreOptions = {}
) {
  const refreshedPlayers = await refreshPlayerScores(db, [playerUuid], options)
  const refreshedPlayer = refreshedPlayers[0]

  return refreshedPlayer?.score ?? 0
}

export async function refreshAllPlayerScores(db: D1Database) {
  const { results } = await db.prepare(`SELECT uuid FROM players`).all<PlayerRow>()
  await refreshPlayerScores(db, results.map((player) => player.uuid), { skipDiscordUpdate: true })
}

export async function refreshScoresForTrial(db: D1Database, trialName: string) {
  const { results } = await db.prepare(
    `SELECT DISTINCT player_uuid
     FROM pbs
     WHERE trial_name = ?`
  )
    .bind(trialName)
    .all<{ player_uuid: string }>()

  for (const row of results) {
    await refreshPlayerScore(db, row.player_uuid, { skipDiscordUpdate: true })
  }
}
