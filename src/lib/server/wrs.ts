import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import { VALID_SUBMISSION_SQL, validSubmissionSql } from "@/lib/server/trial-lifecycle"

type WrRow = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: number
}

type AuditActor = {
  uuid: string
  player_name: string
}

const candidateValidSql = validSubmissionSql("candidate", "t")
const betterValidSql = validSubmissionSql("better", "tb")

export type CurrentVersionWrRow = WrRow & { trial_name: string; previous_thread_id: string | null }

// The two fastest counted runs on the trial's current version, in WR order.
// During the grace period after a trial is changed, the official WR (wrs)
// can still be an old-version time; the first of these is the WR on the new
// version and the second is the one it replaced.
export async function listCurrentVersionWrs(db: D1Database, trialName: string) {
  const now = Math.floor(Date.now() / 1000)
  const { results } = await db.prepare(
    `SELECT s.uuid AS submission_uuid, s.player_uuid, s.player_name, s.trial_name, s.time, s.date, s.thread_id AS previous_thread_id
     FROM submissions AS s
     JOIN trials AS t ON t.name = s.trial_name
     WHERE s.trial_name = ?
       AND s.state = 'approved'
       AND s.trial_version = t.version
       AND ${VALID_SUBMISSION_SQL}
     ORDER BY s.time ASC, s.date ASC, s.uuid ASC
     LIMIT 2`
  )
    .bind(trialName, now, now, now)
    .all<CurrentVersionWrRow>()

  return results || []
}

const runValidSql = validSubmissionSql("s", "t")

// Whether this run, once approved with `time`, would be announced as a WR:
// nothing counted beats it, or (while a changed trial is in its grace
// period) nothing on the current version does. Same order as wrs and
// listCurrentVersionWrs, so it agrees with what moderation then announces.
export async function wouldBeAnnouncedWr(db: D1Database, submissionUuid: string, time: number) {
  const now = Math.floor(Date.now() / 1000)
  const row = await db.prepare(
    `SELECT ${runValidSql} AS counted,
            EXISTS (
              SELECT 1
              FROM submissions AS better
              JOIN trials AS tb ON tb.name = better.trial_name
              WHERE better.trial_name = s.trial_name
                AND better.uuid != s.uuid
                AND better.state = 'approved'
                AND ${betterValidSql}
                AND (s.trial_version != t.version OR better.trial_version = tb.version)
                AND (
                  better.time < ?
                  OR (better.time = ? AND better.date < s.date)
                  OR (better.time = ? AND better.date = s.date AND better.uuid < s.uuid)
                )
            ) AS beaten
     FROM submissions AS s
     JOIN trials AS t ON t.name = s.trial_name
     WHERE s.uuid = ?`
  )
    .bind(now, now, now, now, now, now, time, time, time, submissionUuid)
    .first<{ counted: number; beaten: number }>()

  return Boolean(row?.counted) && !row?.beaten
}

export async function refreshWorldRecords(db: D1Database, trialName?: string, actor?: AuditActor | null) {
  const now = Math.floor(Date.now() / 1000)

  if (trialName) {
    // previous/DELETE/INSERT/current don't need each other's *data* to build
    // their SQL — only their execution order matters (read old state, wipe,
    // rebuild, read new state) — and db.batch() preserves order within one
    // round trip, so this is equivalent to the old 4 sequential awaits.
    const [previousResult, , , currentResult] = await db.batch([
      db.prepare(
        `SELECT submission_uuid, player_uuid, player_name, time, date
         FROM wrs
         WHERE trial_name = ?`
      ).bind(trialName),
      db.prepare(`DELETE FROM wrs WHERE trial_name = ?`).bind(trialName),
      db.prepare(
        `INSERT INTO wrs (trial_name, submission_uuid, player_uuid, player_name, time, date)
         SELECT candidate.trial_name, candidate.uuid, candidate.player_uuid, candidate.player_name, candidate.time, candidate.date
         FROM submissions AS candidate
         JOIN trials AS t ON t.name = candidate.trial_name
         WHERE candidate.trial_name = ?
           AND candidate.state = 'approved'
           AND ${candidateValidSql}
           AND NOT EXISTS (
             SELECT 1
             FROM submissions AS better
             JOIN trials AS tb ON tb.name = better.trial_name
             WHERE better.trial_name = candidate.trial_name
               AND better.state = 'approved'
               AND ${betterValidSql}
               AND (
                 better.time < candidate.time
                 OR (
                   better.time = candidate.time
                   AND better.date < candidate.date
                 )
                 OR (
                   better.time = candidate.time
                   AND better.date = candidate.date
                   AND better.uuid < candidate.uuid
                 )
               )
           )`
      ).bind(trialName, now, now, now, now, now, now),
      db.prepare(
        `SELECT submission_uuid, player_uuid, player_name, time, date
         FROM wrs
         WHERE trial_name = ?`
      ).bind(trialName),
    ])

    const previous = (previousResult.results[0] as WrRow | undefined) ?? null
    const current = (currentResult.results[0] as WrRow | undefined) ?? null

    if (actor) {
      if (!previous && current) {
        await insertAuditLog(db, "wr_created", "wr", current.submission_uuid, {
          actor,
          details: {
            trial_name: trialName,
            player_name: current.player_name,
            time: current.time,
            date: current.date,
          },
        })
      } else if (previous && !current) {
        await insertAuditLog(db, "wr_deleted", "wr", previous.submission_uuid, {
          actor,
          details: {
            trial_name: trialName,
            player_name: previous.player_name,
            time: previous.time,
            date: previous.date,
          },
        })
      } else if (previous && current && previous.submission_uuid !== current.submission_uuid) {
        await insertAuditLog(db, "wr_changed", "wr", current.submission_uuid, {
          actor,
          targetType: "wr",
          targetUuid: previous.submission_uuid,
          details: {
            trial_name: trialName,
            old_submission_uuid: previous.submission_uuid,
            new_submission_uuid: current.submission_uuid,
            old_time: previous.time,
            new_time: current.time,
            old_player_name: previous.player_name,
            new_player_name: current.player_name,
          },
        })
      }
    }

    return
  }

  await db.batch([
    db.prepare(`DELETE FROM wrs`),
    db.prepare(
      `INSERT INTO wrs (trial_name, submission_uuid, player_uuid, player_name, time, date)
       SELECT candidate.trial_name, candidate.uuid, candidate.player_uuid, candidate.player_name, candidate.time, candidate.date
       FROM submissions AS candidate
       JOIN trials AS t ON t.name = candidate.trial_name
       WHERE candidate.state = 'approved'
         AND ${candidateValidSql}
         AND NOT EXISTS (
           SELECT 1
           FROM submissions AS better
           JOIN trials AS tb ON tb.name = better.trial_name
           WHERE better.trial_name = candidate.trial_name
             AND better.state = 'approved'
             AND ${betterValidSql}
             AND (
               better.time < candidate.time
               OR (
                 better.time = candidate.time
                 AND better.date < candidate.date
               )
               OR (
                 better.time = candidate.time
                 AND better.date = candidate.date
                 AND better.uuid < candidate.uuid
               )
             )
         )`
    ).bind(now, now, now, now, now, now),
  ])
}
