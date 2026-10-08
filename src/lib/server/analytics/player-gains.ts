import "server-only"
import calculateScore from "@/lib/calc-score"
import { getPlayerByUuid, getPlayerPosition } from "@/lib/server/repositories/player-repository"
import { getCountedTrialCount, listTrialLifecycles } from "@/lib/server/repositories/trial-repository"
import { canAcceptNewSubmissions } from "@/lib/server/trial-lifecycle"
import type { TrialName } from "@/lib/trials"

// "Biggest gains" on a player's own profile: the trials where they're
// furthest behind the players ranked around them. For each trial that still
// takes submissions, the typical score is the median among those peers
// (a peer without a PB counts as 0, like they do in the score), and the
// typical time is the PB that scores it. Matching it adds
// (typical - yours) / counted trials to the player's score.

// How many players either side of the player count as "around" them.
const PEER_SPAN = 50
const MAX_GAINS = 6

const ACTIVE = "COALESCE(account_status, 'active') != 'deactivated'"

export type PlayerGain = {
  trial_name: string
  pb_time: number | null
  pb_score: number
  typical_time: number
  typical_score: number
  gain: number
  rank_after: number
}

export type PlayerGains = {
  score: number
  rank: number
  peers: { from: number; to: number; count: number }
  gains: PlayerGain[]
  combined: { gain: number; score_after: number; rank_after: number } | null
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export async function getPlayerGains(db: D1Database, playerUuid: string): Promise<PlayerGains | null> {
  const player = await getPlayerByUuid(db, playerUuid)
  if (!player) return null

  const score = Number(player.score || 0)
  const now = Math.floor(Date.now() / 1000)
  const position = await getPlayerPosition(db, score, String(player.player_name))
  const from = Math.max(1, position - PEER_SPAN)
  const to = position + PEER_SPAN

  const ordered = `WITH ordered AS (
    SELECT uuid, ROW_NUMBER() OVER (ORDER BY score DESC, player_name ASC) AS position
    FROM players
    WHERE ${ACTIVE}
  ), peers AS (
    SELECT uuid FROM ordered WHERE position BETWEEN ? AND ? AND uuid != ?
  )`

  const [peerCountResult, peerPbResult, myPbResult, wrResult, rankResult] = await db.batch([
    db.prepare(`${ordered} SELECT COUNT(*) AS count FROM peers`).bind(from, to, playerUuid),
    db
      .prepare(`${ordered} SELECT pbs.player_uuid, pbs.trial_name, pbs.time FROM pbs JOIN peers ON peers.uuid = pbs.player_uuid`)
      .bind(from, to, playerUuid),
    db.prepare(`SELECT trial_name, time FROM pbs WHERE player_uuid = ?`).bind(playerUuid),
    db.prepare(`SELECT trial_name, time FROM wrs`),
    db.prepare(`SELECT COUNT(*) + 1 AS rank FROM players WHERE score > ? AND ${ACTIVE}`).bind(score),
  ])
  const [trialCount, lifecycles] = await Promise.all([getCountedTrialCount(db, now), listTrialLifecycles(db)])

  const peerCount = Number((peerCountResult.results?.[0] as { count?: number } | undefined)?.count ?? 0)
  const rank = Number((rankResult.results?.[0] as { rank?: number } | undefined)?.rank ?? 1)
  const wrByTrial = new Map((wrResult.results as Array<{ trial_name: string; time: number }>).map((row) => [row.trial_name, Number(row.time)]))
  const myPbs = new Map((myPbResult.results as Array<{ trial_name: string; time: number }>).map((row) => [row.trial_name, Number(row.time)]))
  const peerPbs = new Map<string, number[]>()
  for (const row of peerPbResult.results as Array<{ trial_name: string; time: number }>) {
    const list = peerPbs.get(row.trial_name) ?? []
    list.push(Number(row.time))
    peerPbs.set(row.trial_name, list)
  }

  const count = Math.max(trialCount, 1)
  const candidates: Array<Omit<PlayerGain, "rank_after">> = []

  if (peerCount > 0) {
    for (const trial of lifecycles) {
      if (!canAcceptNewSubmissions(trial)) continue
      const wr = wrByTrial.get(trial.name)
      if (!wr) continue
      const scoreOf = (time: number) => calculateScore(wr, time, trial.name as TrialName)

      const times = peerPbs.get(trial.name) ?? []
      const scores = [...times.map(scoreOf), ...Array(Math.max(0, peerCount - times.length)).fill(0)]
      const typicalScore = median(scores)
      if (typicalScore <= 0) continue

      // The peer PB closest to the median score stands for "typical".
      const typicalTime = times.reduce((best, time) => (Math.abs(scoreOf(time) - typicalScore) < Math.abs(scoreOf(best) - typicalScore) ? time : best), times[0])
      const pbTime = myPbs.get(trial.name) ?? null
      const pbScore = pbTime === null ? 0 : scoreOf(pbTime)
      if (pbTime !== null && typicalTime >= pbTime) continue

      const gain = (scoreOf(typicalTime) - pbScore) / count
      if (gain < 0.0005) continue
      candidates.push({
        trial_name: trial.name,
        pb_time: pbTime,
        pb_score: Number(pbScore.toFixed(4)),
        typical_time: typicalTime,
        typical_score: Number(scoreOf(typicalTime).toFixed(4)),
        gain,
      })
    }
  }

  const top = candidates.sort((a, b) => b.gain - a.gain).slice(0, MAX_GAINS)
  if (top.length === 0) {
    return { score, rank, peers: { from, to, count: peerCount }, gains: [], combined: null }
  }

  // Where each gain, and all of them together, would put the player.
  const combinedGain = top.reduce((total, item) => total + item.gain, 0)
  const targets = [...top.map((item) => score + item.gain), score + combinedGain]
  const ranks = await db.batch(
    targets.map((target) => db.prepare(`SELECT COUNT(*) + 1 AS rank FROM players WHERE score > ? AND uuid != ? AND ${ACTIVE}`).bind(Number(target.toFixed(3)), playerUuid))
  )
  const rankAt = (index: number) => Number((ranks[index].results?.[0] as { rank?: number } | undefined)?.rank ?? rank)

  return {
    score,
    rank,
    peers: { from, to, count: peerCount },
    gains: top.map((item, index) => ({ ...item, gain: Number(item.gain.toFixed(4)), rank_after: rankAt(index) })),
    combined: {
      gain: Number(combinedGain.toFixed(4)),
      score_after: Number((score + combinedGain).toFixed(3)),
      rank_after: rankAt(top.length),
    },
  }
}
