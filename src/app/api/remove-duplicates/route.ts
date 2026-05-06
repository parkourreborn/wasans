import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { insertAuditLog } from "@/lib/server/audit"

type DuplicateSubmission = {
  uuid: string
  player_uuid: string
  trial_name: string
  time: number
  date: string
  state: string
  thread_id: string | null
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  // Only allow moderators to run this operation
  const user = await getAuthUser(request, env.wasans)
  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission required", 403)
  }

  try {
    // Find duplicate submissions
    // Duplicates are defined as submissions with the same player_uuid, trial_name, and time
    // We'll keep the most recent one (by date) and delete the others
    const duplicatesQuery = `
      SELECT uuid, player_uuid, trial_name, time, date, state, thread_id
      FROM submissions
      WHERE (player_uuid, trial_name, time) IN (
        SELECT player_uuid, trial_name, time
        FROM submissions
        GROUP BY player_uuid, trial_name, time
        HAVING COUNT(*) > 1
      )
      ORDER BY player_uuid, trial_name, time, date DESC
    `

    const { results: allDuplicates } = await env.wasans.prepare(duplicatesQuery).all<DuplicateSubmission>()

    if (!allDuplicates || allDuplicates.length === 0) {
      return Response.json({
        message: "No duplicates found",
        deletedCount: 0,
        videosDeleted: 0
      })
    }

    // Group duplicates by (player_uuid, trial_name, time)
    const duplicateGroups = new Map<string, DuplicateSubmission[]>()

    for (const submission of allDuplicates) {
      const key = `${submission.player_uuid}:${submission.trial_name}:${submission.time}`
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, [])
      }
      duplicateGroups.get(key)!.push(submission)
    }

    let totalDeleted = 0
    let videosDeleted = 0
    const deletedSubmissions: string[] = []

    // Process each group of duplicates
    for (const [key, submissions] of duplicateGroups) {
      // Sort by date descending (most recent first)
      submissions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // Keep the first (most recent) submission, delete the rest
      const toDelete = submissions.slice(1)

      for (const submission of toDelete) {
        // Delete from related tables first (due to foreign key constraints)
        await env.wasans.prepare(`DELETE FROM wrs WHERE submission_uuid = ?`).bind(submission.uuid).run()
        await env.wasans.prepare(`DELETE FROM pbs WHERE submission_uuid = ?`).bind(submission.uuid).run()

        // Delete from database
        await env.wasans.prepare(`DELETE FROM submissions WHERE uuid = ?`).bind(submission.uuid).run()

        // Delete from R2 bucket if it exists
        if (env.SUBMISSION_VIDEOS) {
          try {
            await env.SUBMISSION_VIDEOS.delete(`scores/${submission.uuid}.mp4`)
            videosDeleted++
          } catch (error) {
            console.warn(`Failed to delete video for submission ${submission.uuid}:`, error)
          }
        }

        // Log the deletion
        await insertAuditLog(env.wasans, "submission_deleted", "submission", submission.uuid, {
          actor: user,
          details: {
            reason: "duplicate_removal",
            player_uuid: submission.player_uuid,
            trial_name: submission.trial_name,
            time: submission.time,
            kept_submission_uuid: submissions[0].uuid
          }
        })

        deletedSubmissions.push(submission.uuid)
        totalDeleted++
      }
    }

    return Response.json({
      message: `Successfully removed ${totalDeleted} duplicate submissions`,
      deletedCount: totalDeleted,
      videosDeleted,
      deletedSubmissions
    })

  } catch (error) {
    console.error("Error removing duplicates:", error)
    return jsonError("Failed to remove duplicates", 500)
  }
}