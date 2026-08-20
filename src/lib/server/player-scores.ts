import "server-only"
import calculateScore from "../calc-score"
import { TrialName } from "../trials"
import { updateDiscordUsernameOnScoreChange } from "./notifications"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"
import { validSubmissionSql } from "@/lib/server/trial-lifecycle"

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

type DiscordUpdateMode = "none" | "changed" | "all"

type RefreshPlayerScoreOptions = {
  discordUpdateMode?: DiscordUpdateMode
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
    const discordUpdateMode = options.discordUpdateMode ?? "changed"

  const uniquePlayerUuids = [...new Set(playerUuids.filter(Boolean))]

  if (!uniquePlayerUuids.length) {
    return [] as Array<{ uuid: string; score: number }>
  }

  const now = Math.floor(Date.now() / 1000)
  const placeholders = uniquePlayerUuids.map(() => "?").join(",")
  const fallbackValidSql = validSubmissionSql("submissions", "t")
  const [{ results: wrRows }, trialCount, { results: pbsRows }, { results: fallbackRows }, { results: currentScoresRows }] = await Promise.all([
    db.prepare(`SELECT trial_name, time FROM wrs`).all<WorldRecordRow>(),
    getCountedTrialCount(db, now),
    db.prepare(`SELECT player_uuid, trial_name, time FROM pbs WHERE player_uuid IN (${placeholders})`).bind(...uniquePlayerUuids).all<BestSubmissionRowWithPlayer>(),
    db.prepare(
      `SELECT submissions.player_uuid AS player_uuid, submissions.trial_name AS trial_name, MIN(submissions.time) as time
       FROM submissions
       JOIN trials AS t ON t.name = submissions.trial_name
       WHERE submissions.player_uuid IN (${placeholders})
         AND submissions.state = 'approved'
         AND ${fallbackValidSql}
       GROUP BY submissions.player_uuid, submissions.trial_name`
    )
      .bind(...uniquePlayerUuids, now, now, now)
      .all<BestSubmissionRowWithPlayer>(),
    db.prepare(`SELECT uuid, score FROM players WHERE uuid IN (${placeholders})`).bind(...uniquePlayerUuids).all<PlayerScoreRow>(),
  ])

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
  const discordUpdates: Array<{ playerUuid: string; oldScore: number }> = []

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

    if (discordUpdateMode === "all" || (discordUpdateMode === "changed" && oldScore !== score)) {
      discordUpdates.push({ playerUuid, oldScore })
    }
  }

  if (updates.length > 0) {
    await db.batch(updates)
  }

  if (discordUpdates.length > 0) {
    await Promise.all(
      discordUpdates.map(({ playerUuid, oldScore }) =>
        updateDiscordUsernameOnScoreChange(playerUuid, oldScore)
      )
    )
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

export async function refreshAllPlayerScores(
  db: D1Database,
  options: { discordUpdateMode?: Extract<DiscordUpdateMode, "none" | "all"> } = {}
) {
  const BATCH_SIZE = 100
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { results } = await db.prepare(`SELECT uuid FROM players LIMIT ? OFFSET ?`).bind(BATCH_SIZE, offset).all<PlayerRow>()
    if (!results || results.length === 0) {
      hasMore = false
      break
    }

    await refreshPlayerScores(db, results.map((player) => player.uuid), {
      discordUpdateMode: options.discordUpdateMode ?? "none",
    })

    if (results.length < BATCH_SIZE) {
      hasMore = false
    } else {
      offset += BATCH_SIZE
    }
  }
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
    await refreshPlayerScore(db, row.player_uuid, { discordUpdateMode: "none" })
  }
}
