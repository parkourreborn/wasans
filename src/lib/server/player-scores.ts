import "server-only"
import calculateScore from "../calc-score"
import { TrialName } from "../trials"
import { getRoleForScore, getRoleIndex, syncDiscordMembersOnScoreChange } from "./notifications"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"
import { validSubmissionSql } from "@/lib/server/trial-lifecycle"
import { checkRankupPrizeCandidates, checkScoreReachedPrizeCandidates } from "@/lib/server/prize-candidate-checker"
import { recordScoreHistory, type ScoreHistoryReason } from "@/lib/server/analytics/score-history"

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
  historyReason?: ScoreHistoryReason
}

type PlayerScoreRow = {
  uuid: string
  score: number
  player_name: string
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
  const historyReason = options.historyReason ?? "manual_refresh"

  const uniquePlayerUuids = [...new Set(playerUuids.filter(Boolean))]

  if (!uniquePlayerUuids.length) {
    return [] as Array<{ uuid: string; score: number }>
  }

  const now = Math.floor(Date.now() / 1000)
  const placeholders = uniquePlayerUuids.map(() => "?").join(",")
  const fallbackValidSql = validSubmissionSql("submissions", "t")
  // The 4 raw reads below are independent of each other, so they go in one
  // D1 batch round trip; trialCount goes through trial-repository's own
  // query, so it's fired concurrently alongside the batch instead.
  const [[wrResult, pbsResult, fallbackResult, currentScoresResult], trialCount] = await Promise.all([
    db.batch([
      db.prepare(`SELECT trial_name, time FROM wrs`),
      db.prepare(`SELECT player_uuid, trial_name, time FROM pbs WHERE player_uuid IN (${placeholders})`).bind(...uniquePlayerUuids),
      db.prepare(
        `SELECT submissions.player_uuid AS player_uuid, submissions.trial_name AS trial_name, MIN(submissions.time) as time
         FROM submissions
         JOIN trials AS t ON t.name = submissions.trial_name
         WHERE submissions.player_uuid IN (${placeholders})
           AND submissions.state = 'approved'
           AND ${fallbackValidSql}
         GROUP BY submissions.player_uuid, submissions.trial_name`
      ).bind(...uniquePlayerUuids, now, now, now),
      db.prepare(`SELECT uuid, score, player_name FROM players WHERE uuid IN (${placeholders})`).bind(...uniquePlayerUuids),
    ]),
    getCountedTrialCount(db, now),
  ])

  const wrRows = (wrResult.results || []) as WorldRecordRow[]
  const pbsRows = (pbsResult.results || []) as BestSubmissionRowWithPlayer[]
  const fallbackRows = (fallbackResult.results || []) as BestSubmissionRowWithPlayer[]
  const currentScoresRows = (currentScoresResult.results || []) as PlayerScoreRow[]

  const wrs = new Map(wrRows.map((row) => [row.trial_name, Number(row.time)]))
  const pbsByPlayer = new Map<string, BestSubmissionRow[]>()
  const fallbackByPlayer = new Map<string, BestSubmissionRow[]>()
  const currentScoresByPlayer = new Map(currentScoresRows.map((row) => [row.uuid, Number(row.score)]))
  const playerNamesByUuid = new Map(currentScoresRows.map((row) => [row.uuid, row.player_name]))

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
  const scoreChanges: Array<{ playerUuid: string; playerName: string; oldScore: number; newScore: number }> = []

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
    if (score !== oldScore) {
      scoreChanges.push({
        playerUuid,
        playerName: playerNamesByUuid.get(playerUuid) ?? "",
        oldScore,
        newScore: score,
      })
    }

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

  if (scoreChanges.length > 0) {
    await recordScoreHistory(
      db,
      scoreChanges.map(({ playerUuid, newScore }) => ({ playerUuid, score: newScore })),
      historyReason
    )
  }

  // Runs for every score change this function makes, regardless of
  // discordUpdateMode -- unlike syncDiscordMembersOnScoreChange below (which
  // only runs when Discord sync isn't explicitly opted out of), prize
  // detection must never depend on that unrelated toggle.
  if (scoreChanges.length > 0) {
    await Promise.all(
      scoreChanges.map(async ({ playerUuid, playerName, oldScore, newScore }) => {
        await checkScoreReachedPrizeCandidates(db, { playerUuid, playerName, oldScore, newScore })

        const oldRoleId = getRoleForScore(oldScore)
        const newRoleId = getRoleForScore(newScore)
        const isPromotion = Boolean(
          oldRoleId && newRoleId && oldRoleId !== newRoleId && getRoleIndex(newRoleId) > getRoleIndex(oldRoleId)
        )
        await checkRankupPrizeCandidates(db, { playerUuid, playerName, isPromotion, newRoleId })
      })
    )
  }

  if (discordUpdates.length > 0) {
    await syncDiscordMembersOnScoreChange(discordUpdates)
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

// Refreshes scores only for players who actually have a current PB on this
// trial — the complete set affected by a WR change on it — in one batched
// refreshPlayerScores call, instead of recomputing every player on the site
// (refreshAllPlayerScores) or looping one-refresh-per-player.
export async function refreshScoresForTrial(
  db: D1Database,
  trialName: string,
  options: RefreshPlayerScoreOptions = {}
) {
  const { results } = await db.prepare(
    `SELECT DISTINCT player_uuid
     FROM pbs
     WHERE trial_name = ?`
  )
    .bind(trialName)
    .all<{ player_uuid: string }>()

  const playerUuids = (results || []).map((row) => row.player_uuid)
  if (!playerUuids.length) {
    return
  }

  await refreshPlayerScores(db, playerUuids, options)
}
