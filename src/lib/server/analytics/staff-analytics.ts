import "server-only"
import { bucketStart, nextBucket, quantile, rangeBucket, rangeDays, type AnalyticsRange, type SeriesPoint, type StaffAnalytics } from "@/lib/analytics"
import { bucketStartSql, fillSeries } from "@/lib/server/analytics/site-analytics"
import { getBackfillStats } from "@/lib/server/repositories/video-repository"

// The moderator-only half of /analytics: how the review queue is doing, how
// the video pipeline is holding up, and who signs up and sticks around.
// Gating is the route's job.

const DAY = 86400

type Count = { n: number | null }
const count = (result: D1Result, key = "n") => Number((result.results[0] as Record<string, number | null> | undefined)?.[key] ?? 0)

export async function getStaffAnalytics(db: D1Database, range: AnalyticsRange): Promise<StaffAnalytics> {
  const now = Math.floor(Date.now() / 1000)
  const days = rangeDays(range)
  const since = days == null ? null : now - days * DAY
  const from = since ?? 0
  const bucket = rangeBucket(range)

  const [moderation, video, accounts] = await Promise.all([
    getModeration(db, from, since, bucket, now),
    getVideo(db, from, since, bucket, now),
    getAccounts(db, from, since, bucket, now),
  ])

  return { generated_at: now, range, bucket, moderation, video, accounts }
}

async function getModeration(
  db: D1Database,
  from: number,
  since: number | null,
  bucket: StaffAnalytics["bucket"],
  now: number
): Promise<StaffAnalytics["moderation"]> {
  const [pending, pendingCombos, pendingByTrial, reviewed, queueRows, denyReasons, combos] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n, MIN(date) AS oldest FROM submissions WHERE state = 'pending' AND imported = 0`),
    db.prepare(`SELECT COUNT(*) AS n FROM combo_submissions WHERE state = 'pending'`),
    db.prepare(
      `SELECT trial_name, COUNT(*) AS count FROM submissions WHERE state = 'pending' AND imported = 0
       GROUP BY trial_name ORDER BY count DESC, trial_name ASC`
    ),
    // Runs reviewed in the range. reviewed_at only exists for reviews since
    // it was added, so older reviews fall back to when the run came in.
    db.prepare(
      `SELECT date, reviewed_at, state, trial_name, moderator_username FROM submissions
       WHERE imported = 0 AND state IN ('approved', 'denied') AND COALESCE(reviewed_at, date) >= ?`
    ).bind(from),
    db.prepare(
      `SELECT date, reviewed_at FROM submissions
       WHERE imported = 0 AND (state = 'pending' OR (reviewed_at IS NOT NULL AND reviewed_at >= ?))`
    ).bind(from),
    db.prepare(
      `SELECT MIN(TRIM(moderator_note)) AS note, COUNT(*) AS count FROM submissions
       WHERE imported = 0 AND state = 'denied' AND COALESCE(reviewed_at, date) >= ?
         AND moderator_note IS NOT NULL AND TRIM(moderator_note) != ''
       GROUP BY LOWER(TRIM(moderator_note)) ORDER BY count DESC LIMIT 12`
    ).bind(from),
    db.prepare(
      `SELECT state, moderator_username, COUNT(*) AS count FROM combo_submissions
       WHERE state IN ('approved', 'denied') AND date >= ? GROUP BY state, moderator_username`
    ).bind(from),
  ])

  type ReviewRow = { date: number; reviewed_at: number | null; state: "approved" | "denied"; trial_name: string; moderator_username: string | null }
  const reviews = reviewed.results as ReviewRow[]

  const byTrial = new Map<string, { approved: number; denied: number }>()
  const moderators = new Map<string, { approved: number; denied: number; combos: number; seconds: number[] }>()
  const moderator = (name: string | null) => {
    const key = name?.trim() || "Unknown"
    const entry = moderators.get(key) ?? { approved: 0, denied: 0, combos: 0, seconds: [] }
    moderators.set(key, entry)
    return entry
  }
  const reviewSeconds: Array<{ at: number; seconds: number }> = []
  let approved = 0
  let denied = 0

  for (const row of reviews) {
    const trial = byTrial.get(row.trial_name) ?? { approved: 0, denied: 0 }
    trial[row.state] += 1
    byTrial.set(row.trial_name, trial)
    if (row.state === "approved") approved += 1
    else denied += 1

    const entry = moderator(row.moderator_username)
    entry[row.state] += 1
    if (row.reviewed_at != null && Number(row.reviewed_at) >= Number(row.date)) {
      const seconds = Number(row.reviewed_at) - Number(row.date)
      entry.seconds.push(seconds)
      reviewSeconds.push({ at: Number(row.reviewed_at), seconds })
    }
  }

  let comboApproved = 0
  let comboDenied = 0
  for (const row of combos.results as Array<{ state: string; moderator_username: string | null; count: number }>) {
    if (row.state === "approved") comboApproved += Number(row.count)
    else comboDenied += Number(row.count)
    moderator(row.moderator_username).combos += Number(row.count)
  }

  const sortedSeconds = reviewSeconds.map((row) => row.seconds).sort((a, b) => a - b)

  // Median review time per bucket, by when the review happened.
  const perBucket = new Map<number, number[]>()
  for (const row of reviewSeconds) {
    const key = bucketStart(row.at, bucket)
    const list = perBucket.get(key) ?? []
    list.push(row.seconds)
    perBucket.set(key, list)
  }
  const reviewSeries = fillSeries(
    [...perBucket.entries()].map(([b, list]) => ({ b, n: Math.round(quantile(list.sort((x, y) => x - y), 0.5)) })),
    bucket,
    since,
    now
  )

  // The queue as it stood at the end of each bucket: runs in by then and
  // not yet reviewed. Reviews from before reviewed_at existed can't be
  // placed, so the queue only goes back as far as that data does.
  const queueSource = queueRows.results as Array<{ date: number; reviewed_at: number | null }>
  const queueStart = since ?? (queueSource.length ? Math.min(...queueSource.map((row) => Number(row.reviewed_at ?? row.date))) : null)
  const queue: SeriesPoint[] = []
  if (queueStart != null) {
    for (let t = bucketStart(queueStart, bucket); t <= now && queue.length < 5000; t = nextBucket(t, bucket)) {
      const end = Math.min(nextBucket(t, bucket), now)
      let waiting = 0
      for (const row of queueSource) {
        if (Number(row.date) <= end && (row.reviewed_at == null || Number(row.reviewed_at) > end)) waiting += 1
      }
      queue.push({ t, v: waiting })
    }
  }

  const pendingRow = pending.results[0] as { n: number; oldest: number | null } | undefined

  return {
    pending_trials: Number(pendingRow?.n ?? 0),
    pending_combos: count(pendingCombos),
    oldest_pending_at: pendingRow?.oldest != null ? Number(pendingRow.oldest) : null,
    pending_by_trial: (pendingByTrial.results as Array<{ trial_name: string; count: number }>).map((row) => ({ ...row, count: Number(row.count) })),
    queue,
    reviewed: reviews.length,
    approved,
    denied,
    review_seconds: {
      median: sortedSeconds.length ? Math.round(quantile(sortedSeconds, 0.5)) : null,
      p90: sortedSeconds.length ? Math.round(quantile(sortedSeconds, 0.9)) : null,
      mean: sortedSeconds.length ? Math.round(sortedSeconds.reduce((sum, value) => sum + value, 0) / sortedSeconds.length) : null,
      series: reviewSeries,
    },
    by_trial: [...byTrial.entries()]
      .map(([trial_name, value]) => ({ trial_name, ...value }))
      .sort((a, b) => b.approved + b.denied - (a.approved + a.denied)),
    moderators: [...moderators.entries()]
      .map(([name, value]) => ({
        name,
        approved: value.approved,
        denied: value.denied,
        combos: value.combos,
        median_seconds: value.seconds.length ? Math.round(quantile(value.seconds.sort((a, b) => a - b), 0.5)) : null,
      }))
      .sort((a, b) => b.approved + b.denied + b.combos - (a.approved + a.denied + a.combos)),
    deny_reasons: (denyReasons.results as Array<{ note: string; count: number }>).map((row) => ({ note: row.note, count: Number(row.count) })),
    combos: { approved: comboApproved, denied: comboDenied },
  }
}

async function getVideo(
  db: D1Database,
  from: number,
  since: number | null,
  bucket: StaffAnalytics["bucket"],
  now: number
): Promise<StaffAnalytics["video"]> {
  const [status, failures, reasons, processing, sources, heights, fps, durations, originals, uploads] = await db.batch([
    db.prepare(`SELECT video_status AS status, COUNT(*) AS count FROM submissions WHERE imported = 0 GROUP BY video_status`),
    db.prepare(
      `SELECT ${bucketStartSql("COALESCE(video_processed_at, video_updated_at, date)", bucket)} AS b, COUNT(*) AS n
       FROM submissions WHERE video_status = 'failed' AND COALESCE(video_processed_at, video_updated_at, date) >= ? GROUP BY 1`
    ).bind(from),
    db.prepare(
      `SELECT SUBSTR(video_error, 1, 160) AS reason, COUNT(*) AS count FROM submissions
       WHERE video_status = 'failed' AND video_error IS NOT NULL AND COALESCE(video_processed_at, video_updated_at, date) >= ?
       GROUP BY reason ORDER BY count DESC LIMIT 10`
    ).bind(from),
    // Same rule as the admin overview: skip backfilled videos and anything
    // that took over a day (a stuck job, not processing time).
    db.prepare(
      `SELECT video_processed_at - date AS seconds FROM submissions
       WHERE video_status = 'ready' AND video_processed_at >= ? AND video_backfill_claimed_at IS NULL
         AND video_processed_at - date BETWEEN 0 AND ${DAY}`
    ).bind(from),
    db.prepare(
      `SELECT COALESCE(video_source_type, 'unknown') AS source, COUNT(*) AS count FROM submissions
       WHERE imported = 0 AND date >= ? GROUP BY source ORDER BY count DESC`
    ).bind(from),
    db.prepare(
      `SELECT CASE
                WHEN video_height IS NULL THEN 'Unknown'
                WHEN video_height < 720 THEN 'Under 720p'
                WHEN video_height < 1080 THEN '720p'
                WHEN video_height < 1440 THEN '1080p'
                WHEN video_height < 2160 THEN '1440p'
                ELSE '4K+'
              END AS label, COUNT(*) AS count
       FROM submissions WHERE imported = 0 AND date >= ? GROUP BY label`
    ).bind(from),
    db.prepare(
      `SELECT CASE
                WHEN video_fps IS NULL THEN 'Unknown'
                WHEN video_fps < 45 THEN '30'
                WHEN video_fps < 90 THEN '60'
                WHEN video_fps < 135 THEN '120'
                ELSE '144+'
              END AS label, COUNT(*) AS count
       FROM submissions WHERE imported = 0 AND date >= ? GROUP BY label`
    ).bind(from),
    db.prepare(`SELECT video_duration AS d FROM submissions WHERE imported = 0 AND date >= ? AND video_duration > 0 ORDER BY video_duration`).bind(from),
    db.prepare(`SELECT COUNT(*) AS n, SUM(original_size) AS bytes FROM submissions WHERE original_key IS NOT NULL`),
    db.prepare(
      `SELECT COUNT(*) AS n, SUM(size_bytes) AS bytes,
              SUM(CASE WHEN consumed_at IS NULL AND created_at < ? THEN 1 ELSE 0 END) AS unused
       FROM video_uploads WHERE created_at >= ?`
    ).bind(now - DAY, from),
  ])

  const statusCounts = { processing: 0, ready: 0, failed: 0 }
  for (const row of status.results as Array<{ status: keyof typeof statusCounts; count: number }>) {
    if (row.status in statusCounts) statusCounts[row.status] = Number(row.count)
  }
  const seconds = (processing.results as Array<{ seconds: number }>).map((row) => Number(row.seconds)).sort((a, b) => a - b)
  const durationList = (durations.results as Array<{ d: number }>).map((row) => Number(row.d))
  const failureSeries = fillSeries(failures.results as Array<{ b: number; n: number }>, bucket, since, now)
  const labelled = (result: D1Result, order: string[]) =>
    (result.results as Array<{ label: string; count: number }>)
      .map((row) => ({ label: row.label, count: Number(row.count) }))
      .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  const originalRow = originals.results[0] as { n: number; bytes: number | null } | undefined
  const uploadRow = uploads.results[0] as { n: number; bytes: number | null; unused: number | null } | undefined

  return {
    status: statusCounts,
    failed_in_range: failureSeries.reduce((sum, point) => sum + point.v, 0),
    failures: failureSeries,
    reasons: (reasons.results as Array<{ reason: string; count: number }>).map((row) => ({ reason: row.reason, count: Number(row.count) })),
    processing_seconds: {
      median: seconds.length ? Math.round(quantile(seconds, 0.5)) : null,
      p90: seconds.length ? Math.round(quantile(seconds, 0.9)) : null,
      samples: seconds.length,
    },
    sources: (sources.results as Array<{ source: string; count: number }>).map((row) => ({ source: row.source, count: Number(row.count) })),
    heights: labelled(heights, ["Under 720p", "720p", "1080p", "1440p", "4K+", "Unknown"]),
    fps: labelled(fps, ["30", "60", "120", "144+", "Unknown"]),
    median_duration: durationList.length ? Number(quantile(durationList, 0.5).toFixed(1)) : null,
    originals: { count: Number(originalRow?.n ?? 0), bytes: Number(originalRow?.bytes ?? 0) },
    uploads: { count: Number(uploadRow?.n ?? 0), bytes: Number(uploadRow?.bytes ?? 0), unused: Number(uploadRow?.unused ?? 0) },
    backfill: await getBackfillStats(db, now),
  }
}

async function getAccounts(
  db: D1Database,
  from: number,
  since: number | null,
  bucket: StaffAnalytics["bucket"],
  now: number
): Promise<StaffAnalytics["accounts"]> {
  const cohortStart = bucketStart(now - 365 * DAY, "month")

  const [signups, providers, statuses, placeholders, bans, deactivated, deleted, linked, multiLinked, neverSubmitted, seen, cohorts, earliest] =
    await db.batch([
      db.prepare(
        `SELECT ${bucketStartSql("date_joined", bucket)} AS b, auth_provider AS provider, COUNT(*) AS n
         FROM players WHERE placeholder = 0 AND date_joined >= ? GROUP BY 1, 2`
      ).bind(from),
      db.prepare(`SELECT auth_provider AS provider, COUNT(*) AS count FROM players WHERE placeholder = 0 GROUP BY auth_provider ORDER BY count DESC`),
      db.prepare(`SELECT account_status AS status, COUNT(*) AS count FROM players WHERE placeholder = 0 GROUP BY account_status`),
      db.prepare(`SELECT COUNT(*) AS n FROM players WHERE placeholder = 1`),
      db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN banned_at >= ? THEN 1 ELSE 0 END) AS recent FROM submission_bans`).bind(from),
      db.prepare(`SELECT COUNT(*) AS n FROM players WHERE deactivated_at >= ?`).bind(from),
      db.prepare(`SELECT COUNT(*) AS n FROM players WHERE deleted_at >= ?`).bind(from),
      db.prepare(`SELECT provider, COUNT(DISTINCT player_uuid) AS count FROM oauth_accounts GROUP BY provider ORDER BY count DESC`),
      db.prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT player_uuid FROM oauth_accounts GROUP BY player_uuid HAVING COUNT(DISTINCT provider) >= 2
         )`
      ),
      db.prepare(
        `SELECT COUNT(*) AS n FROM players p
         WHERE p.placeholder = 0 AND p.account_status = 'active'
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.player_uuid = p.uuid)
           AND NOT EXISTS (SELECT 1 FROM combo_submissions c WHERE c.player_uuid = p.uuid)`
      ),
      db.prepare(
        `SELECT SUM(CASE WHEN m >= ? THEN 1 ELSE 0 END) AS day,
                SUM(CASE WHEN m >= ? THEN 1 ELSE 0 END) AS week,
                SUM(CASE WHEN m >= ? THEN 1 ELSE 0 END) AS month
         FROM (SELECT player_uuid, MAX(last_seen) AS m FROM player_ips GROUP BY player_uuid)`
      ).bind(now - DAY, now - 7 * DAY, now - 30 * DAY),
      // Per player who joined in the last year: whether they submitted in
      // their first week, weeks 2-4 and months 2-3 after joining.
      db.prepare(
        `SELECT p.date_joined AS joined,
                COUNT(s.uuid) AS runs,
                SUM(CASE WHEN s.date < p.date_joined + ${7 * DAY} THEN 1 ELSE 0 END) AS week1,
                SUM(CASE WHEN s.date >= p.date_joined + ${7 * DAY} AND s.date < p.date_joined + ${28 * DAY} THEN 1 ELSE 0 END) AS week2to4,
                SUM(CASE WHEN s.date >= p.date_joined + ${28 * DAY} AND s.date < p.date_joined + ${91 * DAY} THEN 1 ELSE 0 END) AS month2to3
         FROM players p
         LEFT JOIN submissions s ON s.player_uuid = p.uuid AND s.imported = 0
         WHERE p.placeholder = 0 AND p.date_joined >= ?
         GROUP BY p.uuid`
      ).bind(cohortStart),
      db.prepare(`SELECT MIN(date_joined) AS n FROM players WHERE placeholder = 0`),
    ])

  const providerKeys = ["discord", "google", "roblox"] as const
  const signupRows = signups.results as Array<{ b: number; provider: string; n: number }>
  const firstJoined = (earliest.results[0] as Count | undefined)?.n ?? null
  const signupSeries = Object.fromEntries(
    providerKeys.map((provider) => [
      provider,
      fillSeries(
        signupRows.filter((row) => row.provider === provider),
        bucket,
        since,
        now,
        firstJoined
      ),
    ])
  ) as StaffAnalytics["accounts"]["signups"]

  const statusCounts = { active: 0, deactivated: 0, deleted: 0 }
  for (const row of statuses.results as Array<{ status: keyof typeof statusCounts; count: number }>) {
    if (row.status in statusCounts) statusCounts[row.status] = Number(row.count)
  }

  const cohortMap = new Map<number, StaffAnalytics["accounts"]["cohorts"][number]>()
  for (const row of cohorts.results as Array<{ joined: number; runs: number; week1: number | null; week2to4: number | null; month2to3: number | null }>) {
    const month = bucketStart(Number(row.joined), "month")
    const entry = cohortMap.get(month) ?? { month, size: 0, submitted: 0, week1: 0, week2to4: 0, month2to3: 0 }
    entry.size += 1
    if (Number(row.runs) > 0) entry.submitted += 1
    if (Number(row.week1 ?? 0) > 0) entry.week1 += 1
    if (Number(row.week2to4 ?? 0) > 0) entry.week2to4 += 1
    if (Number(row.month2to3 ?? 0) > 0) entry.month2to3 += 1
    cohortMap.set(month, entry)
  }

  const seenRow = seen.results[0] as { day: number | null; week: number | null; month: number | null } | undefined
  const banRow = bans.results[0] as { n: number; recent: number | null } | undefined

  return {
    signups: signupSeries,
    by_provider: (providers.results as Array<{ provider: string; count: number }>).map((row) => ({ ...row, count: Number(row.count) })),
    status: statusCounts,
    placeholders: count(placeholders),
    bans: Number(banRow?.n ?? 0),
    bans_in_range: Number(banRow?.recent ?? 0),
    deactivated_in_range: count(deactivated),
    deleted_in_range: count(deleted),
    linked: (linked.results as Array<{ provider: string; count: number }>).map((row) => ({ ...row, count: Number(row.count) })),
    multi_linked: count(multiLinked),
    never_submitted: count(neverSubmitted),
    seen: { day: Number(seenRow?.day ?? 0), week: Number(seenRow?.week ?? 0), month: Number(seenRow?.month ?? 0) },
    cohorts: [...cohortMap.values()].sort((a, b) => a.month - b.month),
  }
}
