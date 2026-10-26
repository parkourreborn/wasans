import "server-only"
import { bucketStart, quantile, rangeBucket, rangeDays, type AnalyticsRange, type TrialAnalytics } from "@/lib/analytics"
import { bucketStartSql, fillSeries, PB_SET_SQL } from "@/lib/server/analytics/site-analytics"
import { EVER_WR_SQL } from "@/lib/server/repositories/records-repository"

// One trial's deep dive on /analytics: how the record fell, how the field's
// runs got faster month by month, who grinds it and how much a player
// usually takes off their first time.

const DAY = 86400

export async function getTrialAnalytics(db: D1Database, trialName: string, range: AnalyticsRange): Promise<TrialAnalytics> {
  const now = Math.floor(Date.now() / 1000)
  const days = rangeDays(range)
  const since = days == null ? null : now - days * DAY
  const from = since ?? 0
  const bucket = rangeBucket(range)
  const b = (column: string) => bucketStartSql(column, bucket)

  const [history, runs, submitted, approved, pbs, grinders, perPlayer, pbAges, earliest] = await db.batch([
    db.prepare(
      `SELECT s.uuid AS submission_uuid, s.player_uuid, s.player_name, s.time, s.date, s.imported
       FROM submissions s WHERE s.trial_name = ? AND ${EVER_WR_SQL} ORDER BY s.date ASC, s.uuid ASC`
    ).bind(trialName),
    db.prepare(
      `SELECT time, date, player_uuid FROM submissions
       WHERE trial_name = ? AND state = 'approved' AND imported = 0 ORDER BY date ASC`
    ).bind(trialName),
    db.prepare(`SELECT ${b("date")} AS b, COUNT(*) AS n FROM submissions WHERE trial_name = ? AND imported = 0 AND date >= ? GROUP BY 1`).bind(
      trialName,
      from
    ),
    db.prepare(
      `SELECT ${b("date")} AS b, COUNT(*) AS n FROM submissions
       WHERE trial_name = ? AND imported = 0 AND state = 'approved' AND date >= ? GROUP BY 1`
    ).bind(trialName, from),
    db.prepare(`SELECT ${b("s.date")} AS b, COUNT(*) AS n FROM submissions s WHERE s.trial_name = ? AND s.date >= ? AND ${PB_SET_SQL} GROUP BY 1`).bind(
      trialName,
      from
    ),
    db.prepare(
      `SELECT s.player_uuid, p.player_name, COUNT(*) AS runs, MIN(s.time) AS best
       FROM submissions s JOIN players p ON p.uuid = s.player_uuid
       WHERE s.trial_name = ? AND s.state = 'approved' AND s.imported = 0 AND s.date >= ?
         AND COALESCE(p.account_status, 'active') != 'deactivated'
       GROUP BY s.player_uuid ORDER BY runs DESC, best ASC LIMIT 10`
    ).bind(trialName, from),
    // Each player's approved runs on the trial, with their first run's time,
    // for "how much do players take off their first time".
    db.prepare(
      `SELECT s.player_uuid, COUNT(*) AS runs, MIN(s.time) AS best,
              (SELECT f.time FROM submissions f
               WHERE f.player_uuid = s.player_uuid AND f.trial_name = s.trial_name AND f.state = 'approved' AND f.imported = 0
               ORDER BY f.date ASC, f.uuid ASC LIMIT 1) AS first
       FROM submissions s
       WHERE s.trial_name = ? AND s.state = 'approved' AND s.imported = 0
       GROUP BY s.player_uuid`
    ).bind(trialName),
    db.prepare(
      `SELECT pbs.date FROM pbs JOIN players ON players.uuid = pbs.player_uuid
       WHERE pbs.trial_name = ? AND COALESCE(players.account_status, 'active') != 'deactivated'`
    ).bind(trialName),
    db.prepare(`SELECT MIN(date) AS n FROM submissions WHERE trial_name = ? AND imported = 0`).bind(trialName),
  ])

  type RunRow = { time: number; date: number; player_uuid: string }
  const runRows = runs.results as RunRow[]

  const months = new Map<number, { times: number[]; players: Set<string> }>()
  for (const row of runRows) {
    const month = bucketStart(Number(row.date), "month")
    const entry = months.get(month) ?? { times: [], players: new Set<string>() }
    entry.times.push(Number(row.time))
    entry.players.add(row.player_uuid)
    months.set(month, entry)
  }
  const monthly = [...months.entries()]
    .sort((a, c) => a[0] - c[0])
    .map(([t, entry]) => {
      const sorted = [...entry.times].sort((x, y) => x - y)
      return { t, runs: sorted.length, best: sorted[0], median: Number(quantile(sorted, 0.5).toFixed(3)), players: entry.players.size }
    })

  const firstRun = (earliest.results[0] as { n: number | null } | undefined)?.n ?? null
  const fill = (rows: unknown[]) => fillSeries(rows as Array<{ b: number; n: number }>, bucket, since, now, firstRun)

  type PerPlayerRow = { player_uuid: string; runs: number; best: number; first: number | null }
  const players = perPlayer.results as PerPlayerRow[]
  const runCounts = players.map((row) => Number(row.runs)).sort((x, y) => x - y)
  const improvements = players
    .filter((row) => Number(row.runs) > 1 && row.first != null)
    .map((row) => ({ seconds: Number(row.first) - Number(row.best), pct: ((Number(row.first) - Number(row.best)) / Number(row.first)) * 100 }))
  const seconds = improvements.map((row) => row.seconds).sort((x, y) => x - y)
  const pcts = improvements.map((row) => row.pct).sort((x, y) => x - y)
  const ages = (pbAges.results as Array<{ date: number }>).map((row) => (now - Number(row.date)) / DAY).sort((x, y) => x - y)

  return {
    trial_name: trialName,
    bucket,
    wr_history: (history.results as TrialAnalytics["wr_history"]).map((row) => ({
      ...row,
      time: Number(row.time),
      date: Number(row.date),
      imported: Number(row.imported),
    })),
    monthly,
    volume: { submitted: fill(submitted.results), approved: fill(approved.results), pbs: fill(pbs.results) },
    run_times: runRows.map((row) => Number(row.time)).sort((x, y) => x - y),
    top_grinders: (grinders.results as TrialAnalytics["top_grinders"]).map((row) => ({ ...row, runs: Number(row.runs), best: Number(row.best) })),
    grind: {
      players: players.length,
      median_runs: runCounts.length ? quantile(runCounts, 0.5) : 0,
      median_first_to_pb: seconds.length ? Number(quantile(seconds, 0.5).toFixed(3)) : null,
      median_first_to_pb_pct: pcts.length ? Number(quantile(pcts, 0.5).toFixed(2)) : null,
      median_pb_age_days: ages.length ? Math.round(quantile(ages, 0.5)) : null,
      pbs_last_30d: ages.filter((age) => age <= 30).length,
    },
  }
}
