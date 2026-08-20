import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import { validSubmissionSql } from "@/lib/server/trial-lifecycle"

type WrRow = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: string
}

type AuditActor = {
  uuid: string
  player_name: string
}

const candidateValidSql = validSubmissionSql("candidate", "t")
const betterValidSql = validSubmissionSql("better", "tb")

export async function refreshWorldRecords(db: D1Database, trialName?: string, actor?: AuditActor | null) {
  const now = Math.floor(Date.now() / 1000)

  if (trialName) {
    const previous = await db.prepare(
      `SELECT submission_uuid, player_uuid, player_name, time, date
       FROM wrs
       WHERE trial_name = ?`
    )
      .bind(trialName)
      .first<WrRow | null>()

    await db.prepare(`DELETE FROM wrs WHERE trial_name = ?`).bind(trialName).run()
    await db.prepare(
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
                 AND CAST(better.date AS INTEGER) < CAST(candidate.date AS INTEGER)
               )
               OR (
                 better.time = candidate.time
                 AND better.date = candidate.date
                 AND better.uuid < candidate.uuid
               )
             )
         )`
    )
      .bind(trialName, now, now, now, now, now, now)
      .run()

    const current = await db.prepare(
      `SELECT submission_uuid, player_uuid, player_name, time, date
       FROM wrs
       WHERE trial_name = ?`
    )
      .bind(trialName)
      .first<WrRow | null>()

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

  await db.prepare(`DELETE FROM wrs`).run()
  await db.prepare(
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
               AND CAST(better.date AS INTEGER) < CAST(candidate.date AS INTEGER)
             )
             OR (
               better.time = candidate.time
               AND better.date = candidate.date
               AND better.uuid < candidate.uuid
             )
           )
       )`
  )
    .bind(now, now, now, now, now, now)
    .run()
}
