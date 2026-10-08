import "server-only"
import { getBiggestImprovers } from "@/lib/server/analytics/admin-overview"
import { FEATURE_FLAG_KEYS, getFeatureFlagDefault, listFeatureFlags } from "@/lib/server/repositories/feature-flag-repository"
import { getBackfillStats } from "@/lib/server/repositories/video-repository"

// Reads for the admin panel (/admin/*). Owner-only unless a caller says
// otherwise; gating is the route's job.

const DAY = 86400

// Trials with how many players hold a PB on each and the current WR, so the
// Trials page can show what a change would touch.
export async function listAdminTrials(db: D1Database) {
  const { results } = await db.prepare(
    `SELECT trials.name, trials.status, trials.added_at, trials.version, trials.version_changed_at, trials.removed_at, trials.sort_order,
            (SELECT COUNT(*) FROM pbs WHERE pbs.trial_name = trials.name) AS pb_count,
            wrs.time AS wr_time, wrs.player_name AS wr_player_name, wrs.submission_uuid AS wr_submission_uuid
     FROM trials
     LEFT JOIN wrs ON wrs.trial_name = trials.name
     ORDER BY trials.sort_order ASC, trials.name ASC`
  ).all<{
    name: string
    status: "active" | "removed"
    added_at: number
    version: number
    version_changed_at: number | null
    removed_at: number | null
    sort_order: number
    pb_count: number
    wr_time: number | null
    wr_player_name: string | null
    wr_submission_uuid: string | null
  }>()
  return results || []
}

export async function listStaff(db: D1Database) {
  const { results } = await db.prepare(
    `SELECT uuid, player_name, permission, discord_id, discord_avatar, discord_discriminator,
            (avatar_roblox_id IS NOT NULL) AS has_roblox_avatar
     FROM players
     WHERE permission > 0 AND account_status = 'active'
     ORDER BY permission DESC, LOWER(player_name) ASC`
  ).all<{
    uuid: string
    player_name: string
    permission: number
    discord_id: string | null
    discord_avatar: string | null
    discord_discriminator: string | null
    has_roblox_avatar: number
  }>()
  return results || []
}

// One player as the Players page shows them: who they are, what they can do,
// whether they're banned, which accounts are linked and how their runs went.
export async function getAdminPlayer(db: D1Database, uuid: string) {
  const [player, ban, accounts, trialCounts, comboCounts, lastSeen, rank] = await db.batch([
    db.prepare(
      `SELECT uuid, player_id, player_name, permission, score, date_joined, account_status, auth_provider,
              discord_id, discord_avatar, discord_discriminator, (avatar_roblox_id IS NOT NULL) AS has_roblox_avatar
       FROM players WHERE uuid = ?`
    ).bind(uuid),
    db.prepare(`SELECT reason, banned_at, banned_by_name FROM submission_bans WHERE player_uuid = ?`).bind(uuid),
    db.prepare(
      `SELECT provider, provider_account_id, username, display_name, created_at
       FROM oauth_accounts WHERE player_uuid = ? ORDER BY provider ASC, created_at ASC`
    ).bind(uuid),
    db.prepare(`SELECT state, COUNT(*) AS count FROM submissions WHERE player_uuid = ? GROUP BY state`).bind(uuid),
    db.prepare(`SELECT state, COUNT(*) AS count FROM combo_submissions WHERE player_uuid = ? GROUP BY state`).bind(uuid),
    db.prepare(`SELECT MAX(last_seen) AS last_seen FROM player_ips WHERE player_uuid = ?`).bind(uuid),
    db.prepare(
      `SELECT COUNT(*) + 1 AS rank FROM players
       WHERE account_status = 'active' AND score > (SELECT score FROM players WHERE uuid = ?)`
    ).bind(uuid),
  ])

  type PlayerRow = {
    uuid: string
    player_id: string
    player_name: string
    permission: number
    score: number
    date_joined: number
    account_status: string
    auth_provider: string
    discord_id: string | null
    discord_avatar: string | null
    discord_discriminator: string | null
    has_roblox_avatar: number
  }
  const row = (player.results[0] as PlayerRow | undefined) ?? null
  if (!row) return null

  const counts = (rows: unknown[]) => {
    const out = { approved: 0, pending: 0, denied: 0 }
    for (const entry of rows as Array<{ state: keyof typeof out; count: number }>) {
      if (entry.state in out) out[entry.state] = Number(entry.count)
    }
    return out
  }

  return {
    ...row,
    rank: Number((rank.results[0] as { rank: number } | undefined)?.rank ?? 0),
    ban: (ban.results[0] as { reason: string | null; banned_at: number; banned_by_name: string | null } | undefined) ?? null,
    accounts: accounts.results as Array<{
      provider: string
      provider_account_id: string
      username: string | null
      display_name: string | null
      created_at: number
    }>,
    runs: counts(trialCounts.results),
    combos: counts(comboCounts.results),
    last_seen: (lastSeen.results[0] as { last_seen: number | null } | undefined)?.last_seen ?? null,
  }
}

export async function getVideoHealth(db: D1Database, now: number) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN video_status = 'processing' THEN 1 ELSE 0 END) AS processing,
       SUM(CASE WHEN video_status = 'failed' AND video_processed_at >= ? THEN 1 ELSE 0 END) AS failed_7d,
       SUM(CASE WHEN video_status = 'failed' AND state = 'pending' THEN 1 ELSE 0 END) AS failed_pending,
       AVG(CASE WHEN video_status = 'ready' AND video_processed_at >= ? AND video_backfill_claimed_at IS NULL
                 AND video_processed_at - date BETWEEN 0 AND ${DAY}
            THEN video_processed_at - date END) AS avg_seconds_24h
     FROM submissions
     WHERE video_status != 'ready' OR video_processed_at >= ?`
  )
    .bind(now - 7 * DAY, now - DAY, now - 7 * DAY)
    .first<{ processing: number | null; failed_7d: number | null; failed_pending: number | null; avg_seconds_24h: number | null }>()

  return {
    processing: Number(row?.processing ?? 0),
    failed_7d: Number(row?.failed_7d ?? 0),
    failed_pending: Number(row?.failed_pending ?? 0),
    avg_seconds_24h: row?.avg_seconds_24h == null ? null : Math.round(Number(row.avg_seconds_24h)),
  }
}

// Every flag, including ones that have never been written (they read as
// their default).
export async function listAllFeatureFlags(db: D1Database) {
  const rows = await listFeatureFlags(db).catch(() => [])
  return FEATURE_FLAG_KEYS.map((key) => {
    const row = rows.find((entry) => entry.key === key)
    return {
      key,
      enabled: row ? Number(row.enabled) === 1 : getFeatureFlagDefault(key),
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updated_by ?? null,
    }
  })
}

// The newest audit row for each action, for "last run" lines.
export async function getLastRuns(db: D1Database, actions: readonly string[]) {
  if (actions.length === 0) return {}
  const placeholders = actions.map(() => "?").join(", ")
  const { results } = await db.prepare(
    `SELECT action, created_at, actor_name, details
     FROM audit_logs AS a
     WHERE action IN (${placeholders})
       AND created_at = (SELECT MAX(created_at) FROM audit_logs AS b WHERE b.action = a.action)`
  )
    .bind(...actions)
    .all<{ action: string; created_at: number; actor_name: string | null; details: string | null }>()

  const out: Record<string, { created_at: number; actor_name: string | null; details: unknown }> = {}
  for (const row of results || []) {
    let details: unknown = null
    try {
      details = row.details ? JSON.parse(row.details) : null
    } catch {
      details = null
    }
    out[row.action] = { created_at: row.created_at, actor_name: row.actor_name, details }
  }
  return out
}

type Window = { from: number; to: number }

// Counts for one window: runs and combos submitted, approvals, new players,
// and how many distinct players submitted anything.
async function activityCounts(db: D1Database, { from, to }: Window) {
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM submissions WHERE date >= ?1 AND date < ?2)
         + (SELECT COUNT(*) FROM combo_submissions WHERE date >= ?1 AND date < ?2) AS submitted,
       (SELECT COUNT(*) FROM audit_logs
          WHERE action IN ('submission_approved', 'combo_submission_approved') AND created_at >= ?1 AND created_at < ?2) AS approved,
       (SELECT COUNT(*) FROM players WHERE date_joined >= ?1 AND date_joined < ?2) AS new_players,
       (SELECT COUNT(*) FROM (
          SELECT player_uuid FROM submissions WHERE date >= ?1 AND date < ?2
          UNION
          SELECT player_uuid FROM combo_submissions WHERE date >= ?1 AND date < ?2
        )) AS submitting_players`
  )
    .bind(from, to)
    .first<{ submitted: number; approved: number; new_players: number; submitting_players: number }>()

  return {
    submitted: Number(row?.submitted ?? 0),
    approved: Number(row?.approved ?? 0),
    new_players: Number(row?.new_players ?? 0),
    submitting_players: Number(row?.submitting_players ?? 0),
  }
}

// Per-day counts across a window, oldest first, one entry per day.
async function activitySeries(db: D1Database, { from, to }: Window) {
  const days = Math.round((to - from) / DAY)
  const [submitted, approved, joined, submitters] = await db.batch([
    db.prepare(
      `SELECT CAST((date - ?1) / ${DAY} AS INTEGER) AS day, COUNT(*) AS count FROM (
         SELECT date FROM submissions WHERE date >= ?1 AND date < ?2
         UNION ALL
         SELECT date FROM combo_submissions WHERE date >= ?1 AND date < ?2
       ) GROUP BY day`
    ).bind(from, to),
    db.prepare(
      `SELECT CAST((created_at - ?1) / ${DAY} AS INTEGER) AS day, COUNT(*) AS count FROM audit_logs
       WHERE action IN ('submission_approved', 'combo_submission_approved') AND created_at >= ?1 AND created_at < ?2
       GROUP BY day`
    ).bind(from, to),
    db.prepare(
      `SELECT CAST((date_joined - ?1) / ${DAY} AS INTEGER) AS day, COUNT(*) AS count FROM players
       WHERE date_joined >= ?1 AND date_joined < ?2 GROUP BY day`
    ).bind(from, to),
    db.prepare(
      `SELECT day, COUNT(DISTINCT player_uuid) AS count FROM (
         SELECT CAST((date - ?1) / ${DAY} AS INTEGER) AS day, player_uuid FROM submissions WHERE date >= ?1 AND date < ?2
         UNION ALL
         SELECT CAST((date - ?1) / ${DAY} AS INTEGER) AS day, player_uuid FROM combo_submissions WHERE date >= ?1 AND date < ?2
       ) GROUP BY day`
    ).bind(from, to),
  ])

  const fill = (rows: unknown[]) => {
    const out = new Array<number>(days).fill(0)
    for (const entry of rows as Array<{ day: number; count: number }>) {
      if (entry.day >= 0 && entry.day < days) out[entry.day] = Number(entry.count)
    }
    return out
  }

  return {
    submitted: fill(submitted.results),
    approved: fill(approved.results),
    new_players: fill(joined.results),
    submitting_players: fill(submitters.results),
  }
}

export async function getAdminOverview(db: D1Database, now: number, periodDays: 7 | 30) {
  const current = { from: now - periodDays * DAY, to: now }
  const previous = { from: now - 2 * periodDays * DAY, to: now - periodDays * DAY }

  const [queue, errors, candidates, video, flags, compilation, backfill, activityNow, activityBefore, series, climbers] =
    await Promise.all([
      db.prepare(
        `SELECT
           (SELECT COUNT(*) FROM submissions WHERE state = 'pending') AS trials,
           (SELECT COUNT(*) FROM combo_submissions WHERE state = 'pending') AS combos,
           (SELECT MIN(date) FROM (
              SELECT date FROM submissions WHERE state = 'pending'
              UNION ALL
              SELECT date FROM combo_submissions WHERE state = 'pending'
            )) AS oldest`
      ).first<{ trials: number; combos: number; oldest: number | null }>(),
      db.prepare(
        `SELECT
           (SELECT COUNT(*) FROM audit_logs WHERE action = 'site_error' AND created_at >= ?) AS count_24h,
           (SELECT details FROM audit_logs WHERE action = 'site_error' ORDER BY created_at DESC LIMIT 1) AS latest_details,
           (SELECT created_at FROM audit_logs WHERE action = 'site_error' ORDER BY created_at DESC LIMIT 1) AS latest_at`
      )
        .bind(now - DAY)
        .first<{ count_24h: number; latest_details: string | null; latest_at: number | null }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM prize_candidates WHERE status = 'pending'`).first<{ count: number }>(),
      getVideoHealth(db, now),
      listAllFeatureFlags(db),
      db.prepare(
        `SELECT title, status, created_at, finished_at FROM wr_compilations ORDER BY created_at DESC LIMIT 1`
      ).first<{ title: string; status: string; created_at: number; finished_at: number | null }>().catch(() => null),
      getBackfillStats(db, now),
      activityCounts(db, current),
      activityCounts(db, previous),
      activitySeries(db, current),
      getBiggestImprovers(db, periodDays, 5),
    ])

  let latestError: { created_at: number; message: string; path: string | null } | null = null
  if (errors?.latest_at) {
    let details: { message?: string; path?: string } = {}
    try {
      details = errors.latest_details ? JSON.parse(errors.latest_details) : {}
    } catch {
      details = {}
    }
    latestError = { created_at: errors.latest_at, message: String(details.message || "Unknown error"), path: details.path ?? null }
  }

  return {
    period_days: periodDays,
    waiting: {
      pending_trials: Number(queue?.trials ?? 0),
      pending_combos: Number(queue?.combos ?? 0),
      oldest_pending_at: queue?.oldest ?? null,
      prize_candidates: Number(candidates?.count ?? 0),
      errors_24h: Number(errors?.count_24h ?? 0),
      latest_error: latestError,
    },
    health: {
      flags,
      video,
      backfill,
      compilation: compilation ?? null,
    },
    activity: {
      current: activityNow,
      previous: activityBefore,
      series,
      climbers,
    },
  }
}
