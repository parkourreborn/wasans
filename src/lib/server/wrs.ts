import "server-only"

export async function refreshWorldRecords(db: D1Database, trialName?: string) {
  if (trialName) {
    await db.prepare(`DELETE FROM wrs WHERE trial_name = ?`).bind(trialName).run()
    await db.prepare(
      `INSERT INTO wrs (trial_name, submission_uuid, player_uuid, player_name, time, date)
       SELECT trial_name, uuid, player_uuid, player_name, time, date
       FROM submissions AS candidate
       WHERE candidate.trial_name = ?
         AND candidate.state = 'approved'
         AND NOT EXISTS (
           SELECT 1
           FROM submissions AS better
           WHERE better.trial_name = candidate.trial_name
             AND better.state = 'approved'
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
      .bind(trialName)
      .run()
    return
  }

  await db.prepare(`DELETE FROM wrs`).run()
  await db.prepare(
    `INSERT INTO wrs (trial_name, submission_uuid, player_uuid, player_name, time, date)
     SELECT trial_name, uuid, player_uuid, player_name, time, date
     FROM submissions AS candidate
     WHERE candidate.state = 'approved'
       AND NOT EXISTS (
         SELECT 1
         FROM submissions AS better
         WHERE better.trial_name = candidate.trial_name
           AND better.state = 'approved'
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
  ).run()
}
