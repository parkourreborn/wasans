import "server-only"
import calculateScore from "@/lib/calc-score"
import { trials as knownTrials, type TrialName } from "@/lib/trials"
import {
  ACTIVITY_METRICS,
  bucketStart,
  nextBucket,
  rangeBucket,
  rangeDays,
  type ActivityMetric,
  type AnalyticsBucket,
  type AnalyticsRange,
  type PublicAnalytics,
  type SeriesPoint,
  type TrialSummary,
} from "@/lib/analytics"
import { getBiggestImprovers } from "@/lib/server/analytics/admin-overview"
import { EVER_WR_SQL } from "@/lib/server/repositories/records-repository"
import { getCountedTrialCount } from "@/lib/server/repositories/trial-repository"

// The public /analytics page: every trial's current PBs, how the trials
// relate to each other, site activity over the picked range and where
// players stand. Computed on demand from the live tables (the route caches
// it); at this site's size every query here is a scan of thousands of rows,
// not millions.

const DAY = 86400
const ACTIVE_PLAYER_SQL = `COALESCE(account_status, 'active') != 'deactivated' AND placeholder = 0`

// An approved run that beat every earlier approved run of the same player
// on the same trial: a PB when it was set. Ties go to the earlier run.
export const PB_SET_SQL = `s.state = 'approved' AND s.imported = 0 AND NOT EXISTS (
  SELECT 1 FROM submissions e
  WHERE e.player_uuid = s.player_uuid
    AND e.trial_name = s.trial_name
    AND e.state = 'approved'
    AND e.imported = 0
    AND (e.date < s.date OR (e.date = s.date AND e.uuid < s.uuid))
    AND e.time <= s.time
)`

// SQL twin of bucketStart in src/lib/analytics.ts.
export function bucketStartSql(column: string, bucket: AnalyticsBucket) {
  if (bucket === "day") return `((${column}) / ${DAY}) * ${DAY}`
  if (bucket === "week") return `((((${column}) / ${DAY}) + 3) / 7 * 7 - 3) * ${DAY}`
  return `CAST(strftime('%s', ${column}, 'unixepoch', 'start of month') AS INTEGER)`
}

// Turns sparse {bucket: count} rows into a gap-free series from the first
// bucket (the range start, or the earliest row for all time) up to now.
export function fillSeries(
  rows: Array<{ b: number; n: number | null }>,
  bucket: AnalyticsBucket,
  since: number | null,
  now: number,
  earliest?: number | null
): SeriesPoint[] {
  const counts = new Map(rows.map((row) => [Number(row.b), Number(row.n ?? 0)]))
  const firstRow = rows.length ? Math.min(...rows.map((row) => Number(row.b))) : null
  const startFrom = since ?? earliest ?? firstRow
  if (startFrom == null) return []
  const end = bucketStart(now, bucket)
  const points: SeriesPoint[] = []
  // A runaway loop is impossible for sane inputs, but an absurd timestamp
  // in the data shouldn't hang the request.
  for (let t = bucketStart(startFrom, bucket); t <= end && points.length < 5000; t = nextBucket(t, bucket)) {
    points.push({ t, v: counts.get(t) ?? 0 })
  }
  return points
}

function isoDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

function pearson(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 5) return null
  const mx = xs.reduce((sum, value) => sum + value, 0) / n
  const my = ys.reduce((sum, value) => sum + value, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - mx
    const dy = ys[index] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return Number((sxy / Math.sqrt(sxx * syy)).toFixed(3))
}

type Count = { n: number | null }
type BucketRow = { b: number; n: number | null }

export async function getPublicAnalytics(db: D1Database, range: AnalyticsRange): Promise<PublicAnalytics> {
  const now = Math.floor(Date.now() / 1000)
  const days = rangeDays(range)
  const since = days == null ? null : now - days * DAY
  const previousSince = days == null ? null : now - 2 * days * DAY
  const from = since ?? 0
  const bucket = rangeBucket(range)
  const b = (column: string) => bucketStartSql(column, bucket)

  const [
    trialRows,
    wrRows,
    pbRows,
    wrStats,
    trialVolume,
    trialPbs,
    trialNewPlayers,
    submittedSeries,
    approvedSeries,
    pbSeries,
    wrSeries,
    joinedSeries,
    activeSeries,
    heatmapRows,
    activeTotal,
    earliestRow,
    scoreRows,
    holderRows,
  ] = await db.batch([
    db.prepare(`SELECT name, status, version, added_at FROM trials ORDER BY sort_order ASC, name ASC`),
    db.prepare(
      `SELECT wrs.trial_name, wrs.time, wrs.player_uuid, wrs.player_name, wrs.date
       FROM wrs JOIN players ON players.uuid = wrs.player_uuid
       WHERE COALESCE(players.account_status, 'active') != 'deactivated'`
    ),
    db.prepare(
      `SELECT pbs.player_uuid, pbs.trial_name, pbs.time
       FROM pbs JOIN players ON players.uuid = pbs.player_uuid
       WHERE COALESCE(players.account_status, 'active') != 'deactivated'
       ORDER BY pbs.trial_name, pbs.time ASC`
    ),
    db.prepare(
      `SELECT s.trial_name, COUNT(*) AS n, COUNT(DISTINCT s.player_uuid) AS holders, MIN(s.date) AS first
       FROM submissions s WHERE ${EVER_WR_SQL} GROUP BY s.trial_name`
    ),
    db.prepare(
      `SELECT trial_name, COUNT(*) AS submitted, SUM(CASE WHEN state = 'approved' THEN 1 ELSE 0 END) AS approved
       FROM submissions WHERE imported = 0 AND date >= ? GROUP BY trial_name`
    ).bind(from),
    db.prepare(`SELECT s.trial_name, COUNT(*) AS n FROM submissions s WHERE s.date >= ? AND ${PB_SET_SQL} GROUP BY s.trial_name`).bind(from),
    db.prepare(
      `SELECT trial_name, COUNT(*) AS n FROM (
         SELECT trial_name, MIN(date) AS first FROM submissions
         WHERE state = 'approved' AND imported = 0 GROUP BY trial_name, player_uuid
       ) WHERE first >= ? GROUP BY trial_name`
    ).bind(from),
    db.prepare(`SELECT ${b("date")} AS b, COUNT(*) AS n FROM submissions WHERE imported = 0 AND date >= ? GROUP BY 1`).bind(from),
    db.prepare(
      `SELECT ${b("date")} AS b, COUNT(*) AS n FROM submissions WHERE imported = 0 AND state = 'approved' AND date >= ? GROUP BY 1`
    ).bind(from),
    db.prepare(`SELECT ${b("s.date")} AS b, COUNT(*) AS n FROM submissions s WHERE s.date >= ? AND ${PB_SET_SQL} GROUP BY 1`).bind(from),
    db.prepare(`SELECT ${b("s.date")} AS b, COUNT(*) AS n FROM submissions s WHERE s.date >= ? AND ${EVER_WR_SQL} GROUP BY 1`).bind(from),
    db.prepare(`SELECT ${b("date_joined")} AS b, COUNT(*) AS n FROM players WHERE placeholder = 0 AND date_joined >= ? GROUP BY 1`).bind(from),
    db.prepare(
      `SELECT ${b("date")} AS b, COUNT(DISTINCT player_uuid) AS n FROM submissions WHERE imported = 0 AND date >= ? GROUP BY 1`
    ).bind(from),
    db.prepare(
      `SELECT CAST(strftime('%w', date, 'unixepoch') AS INTEGER) AS w, CAST(strftime('%H', date, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n
       FROM submissions WHERE imported = 0 AND date >= ? GROUP BY w, h`
    ).bind(from),
    db.prepare(`SELECT COUNT(DISTINCT player_uuid) AS n FROM submissions WHERE imported = 0 AND date >= ?`).bind(from),
    db.prepare(`SELECT MIN(date) AS n FROM submissions WHERE imported = 0`),
    db.prepare(`SELECT score FROM players WHERE ${ACTIVE_PLAYER_SQL} ORDER BY score ASC`),
    db.prepare(
      `SELECT wrs.player_uuid, wrs.player_name, COUNT(*) AS count
       FROM wrs JOIN players ON players.uuid = wrs.player_uuid
       WHERE COALESCE(players.account_status, 'active') != 'deactivated'
       GROUP BY wrs.player_uuid ORDER BY count DESC, wrs.player_name ASC LIMIT 15`
    ),
  ])

  type TrialRow = { name: string; status: "active" | "removed"; version: number; added_at: number }
  type WrRow = { trial_name: string; time: number; player_uuid: string; player_name: string; date: number }
  type PbRow = { player_uuid: string; trial_name: string; time: number }
  type WrStatRow = { trial_name: string; n: number; holders: number; first: number }
  type VolumeRow = { trial_name: string; submitted: number; approved: number | null }
  type TrialCountRow = { trial_name: string; n: number }

  const wrByTrial = new Map((wrRows.results as WrRow[]).map((row) => [row.trial_name, row]))
  const wrStatByTrial = new Map((wrStats.results as WrStatRow[]).map((row) => [row.trial_name, row]))
  const volumeByTrial = new Map((trialVolume.results as VolumeRow[]).map((row) => [row.trial_name, row]))
  const pbsByTrial = new Map((trialPbs.results as TrialCountRow[]).map((row) => [row.trial_name, Number(row.n)]))
  const newByTrial = new Map((trialNewPlayers.results as TrialCountRow[]).map((row) => [row.trial_name, Number(row.n)]))

  const timesByTrial = new Map<string, number[]>()
  const scoresByPlayer = new Map<string, Map<string, number>>()
  for (const row of pbRows.results as PbRow[]) {
    const time = Number(row.time)
    const list = timesByTrial.get(row.trial_name) ?? []
    list.push(time)
    timesByTrial.set(row.trial_name, list)

    const wr = wrByTrial.get(row.trial_name)
    if (wr && knownTrials.includes(row.trial_name as TrialName)) {
      const scores = scoresByPlayer.get(row.player_uuid) ?? new Map<string, number>()
      scores.set(row.trial_name, calculateScore(Number(wr.time), time, row.trial_name as TrialName))
      scoresByPlayer.set(row.player_uuid, scores)
    }
  }

  const trialSummaries: TrialSummary[] = (trialRows.results as TrialRow[]).map((trial) => {
    const wr = wrByTrial.get(trial.name)
    const stat = wrStatByTrial.get(trial.name)
    const volume = volumeByTrial.get(trial.name)
    return {
      trial_name: trial.name,
      status: trial.status,
      version: Number(trial.version),
      added_at: Number(trial.added_at),
      wr: wr
        ? { time: Number(wr.time), player_uuid: wr.player_uuid, player_name: wr.player_name, date: Number(wr.date) }
        : null,
      times: timesByTrial.get(trial.name) ?? [],
      wr_changes: stat ? Math.max(0, Number(stat.n) - 1) : 0,
      wr_holders: stat ? Number(stat.holders) : 0,
      first_wr_at: stat?.first != null ? Number(stat.first) : null,
      submitted: Number(volume?.submitted ?? 0),
      approved: Number(volume?.approved ?? 0),
      pbs_set: pbsByTrial.get(trial.name) ?? 0,
      new_players: newByTrial.get(trial.name) ?? 0,
    }
  })

  // How well a player's score on one trial predicts their score on another,
  // over the players with a PB on both.
  const correlationTrials = trialSummaries.filter((trial) => trial.wr && trial.times.length >= 5).map((trial) => trial.trial_name)
  const playerScores = [...scoresByPlayer.values()]
  const matrix: Array<Array<number | null>> = []
  const samples: number[][] = []
  for (const a of correlationTrials) {
    const row: Array<number | null> = []
    const sampleRow: number[] = []
    for (const c of correlationTrials) {
      if (a === c) {
        row.push(1)
        sampleRow.push(timesByTrial.get(a)?.length ?? 0)
        continue
      }
      const xs: number[] = []
      const ys: number[] = []
      for (const scores of playerScores) {
        const x = scores.get(a)
        const y = scores.get(c)
        if (x !== undefined && y !== undefined) {
          xs.push(x)
          ys.push(y)
        }
      }
      row.push(pearson(xs, ys))
      sampleRow.push(xs.length)
    }
    matrix.push(row)
    samples.push(sampleRow)
  }

  const earliest = (earliestRow.results[0] as Count | undefined)?.n ?? null
  const fill = (rows: unknown[]) => fillSeries(rows as BucketRow[], bucket, since, now, earliest)
  const series: Record<ActivityMetric, SeriesPoint[]> = {
    submitted: fill(submittedSeries.results),
    approved: fill(approvedSeries.results),
    pbs: fill(pbSeries.results),
    wrs: fill(wrSeries.results),
    new_players: fill(joinedSeries.results),
    active_players: fill(activeSeries.results),
  }
  const sum = (points: SeriesPoint[]) => points.reduce((total, point) => total + point.v, 0)
  const totals = Object.fromEntries(ACTIVITY_METRICS.map((metric) => [metric, sum(series[metric])])) as Record<ActivityMetric, number>
  totals.active_players = Number((activeTotal.results[0] as Count | undefined)?.n ?? 0)

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const row of heatmapRows.results as Array<{ w: number; h: number; n: number }>) {
    if (row.w >= 0 && row.w < 7 && row.h >= 0 && row.h < 24) heatmap[row.w][row.h] = Number(row.n)
  }

  const [previous, countedTrials, improvers, churn] = await Promise.all([
    since != null && previousSince != null ? getPreviousTotals(db, previousSince, since) : Promise.resolve(null),
    getCountedTrialCount(db, now),
    getBiggestImprovers(db, days ?? 36500, 10),
    getRankChurn(db, since),
  ])

  const trialsAttempted = new Map<string, number>()
  for (const row of pbRows.results as PbRow[]) {
    trialsAttempted.set(row.player_uuid, (trialsAttempted.get(row.player_uuid) ?? 0) + 1)
  }

  return {
    generated_at: now,
    range,
    bucket,
    since,
    trials: trialSummaries,
    correlation: { trials: correlationTrials, matrix, samples },
    activity: { series, totals, previous, heatmap },
    players: {
      scores: (scoreRows.results as Array<{ score: number }>).map((row) => Number(Number(row.score).toFixed(4))),
      trials_attempted: [...trialsAttempted.values()],
      counted_trials: countedTrials,
      with_pb: trialsAttempted.size,
      improvers,
      churn,
      wr_holders: (holderRows.results as Array<{ player_uuid: string; player_name: string; count: number }>).map((row) => ({
        ...row,
        count: Number(row.count),
      })),
    },
  }
}

async function getPreviousTotals(db: D1Database, start: number, end: number): Promise<Record<ActivityMetric, number>> {
  const results = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE imported = 0 AND date >= ? AND date < ?`).bind(start, end),
    db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE imported = 0 AND state = 'approved' AND date >= ? AND date < ?`).bind(start, end),
    db.prepare(`SELECT COUNT(*) AS n FROM submissions s WHERE s.date >= ? AND s.date < ? AND ${PB_SET_SQL}`).bind(start, end),
    db.prepare(`SELECT COUNT(*) AS n FROM submissions s WHERE s.date >= ? AND s.date < ? AND ${EVER_WR_SQL}`).bind(start, end),
    db.prepare(`SELECT COUNT(*) AS n FROM players WHERE placeholder = 0 AND date_joined >= ? AND date_joined < ?`).bind(start, end),
    db.prepare(`SELECT COUNT(DISTINCT player_uuid) AS n FROM submissions WHERE imported = 0 AND date >= ? AND date < ?`).bind(start, end),
  ])
  const value = (index: number) => Number((results[index].results[0] as Count | undefined)?.n ?? 0)
  return {
    submitted: value(0),
    approved: value(1),
    pbs: value(2),
    wrs: value(3),
    new_players: value(4),
    active_players: value(5),
  }
}

// Ranks at the first daily snapshot inside the range against the latest one.
async function getRankChurn(db: D1Database, since: number | null): Promise<PublicAnalytics["players"]["churn"]> {
  const bounds = await db
    .prepare(
      `SELECT (SELECT MIN(snapshot_date) FROM player_rank_snapshots WHERE snapshot_date >= ?) AS start_date,
              (SELECT MAX(snapshot_date) FROM player_rank_snapshots) AS end_date`
    )
    .bind(since == null ? "0000-00-00" : isoDate(since))
    .first<{ start_date: string | null; end_date: string | null }>()

  const empty = { from: null, to: null, moved_up: 0, moved_down: 0, unchanged: 0, average_move: 0, top10_kept: 0, climbers: [] }
  if (!bounds?.start_date || !bounds.end_date || bounds.start_date === bounds.end_date) {
    return { ...empty, from: bounds?.start_date ?? null, to: bounds?.end_date ?? null }
  }

  const { results } = await db
    .prepare(
      `SELECT b.player_uuid, p.player_name, a.rank AS start_rank, b.rank AS end_rank
       FROM player_rank_snapshots b
       JOIN player_rank_snapshots a ON a.player_uuid = b.player_uuid AND a.snapshot_date = ?
       JOIN players p ON p.uuid = b.player_uuid
       WHERE b.snapshot_date = ? AND COALESCE(p.account_status, 'active') != 'deactivated' AND p.placeholder = 0`
    )
    .bind(bounds.start_date, bounds.end_date)
    .all<{ player_uuid: string; player_name: string; start_rank: number; end_rank: number }>()

  const rows = results || []
  let up = 0
  let down = 0
  let moveTotal = 0
  for (const row of rows) {
    const move = Number(row.start_rank) - Number(row.end_rank)
    if (move > 0) up += 1
    else if (move < 0) down += 1
    moveTotal += Math.abs(move)
  }

  return {
    from: bounds.start_date,
    to: bounds.end_date,
    moved_up: up,
    moved_down: down,
    unchanged: rows.length - up - down,
    average_move: rows.length ? Number((moveTotal / rows.length).toFixed(2)) : 0,
    top10_kept: rows.filter((row) => Number(row.start_rank) <= 10 && Number(row.end_rank) <= 10).length,
    climbers: rows
      .filter((row) => Number(row.start_rank) > Number(row.end_rank))
      .sort((a, b) => Number(b.start_rank) - Number(b.end_rank) - (Number(a.start_rank) - Number(a.end_rank)))
      .slice(0, 10)
      .map((row) => ({ player_uuid: row.player_uuid, player_name: row.player_name, from: Number(row.start_rank), to: Number(row.end_rank) })),
  }
}
