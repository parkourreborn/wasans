import { getCloudflareContext } from "@opennextjs/cloudflare"
import { canModerate, getAuthUser } from "@/lib/server/auth"
import { insertAuditLog } from "@/lib/server/audit"
import { jsonError, jsonResponse } from "@/lib/server/http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return jsonError("DB binding not available", 500)
  }

  const user = await getAuthUser(request, env.wasans)
  if (!user || !canModerate(user)) {
    return jsonError("Moderator permission required", 403)
  }

  const duplicates = await env.wasans.prepare(
    `SELECT uuid
     FROM (
       SELECT uuid,
              ROW_NUMBER() OVER (
                PARTITION BY player_uuid, trial_name, time
                ORDER BY CAST(date AS INTEGER) DESC, uuid DESC
              ) AS row_num
       FROM submissions
     ) ranked
     WHERE ranked.row_num > 1`
  ).all<{ uuid: string }>()

  const duplicateUuids = (duplicates.results || []).map((row) => row.uuid)
  if (duplicateUuids.length === 0) {
    return jsonResponse({ deletedCount: 0, deletedSubmissions: [] })
  }

  const session = env.wasans.withSession("first-primary")
  const statements: ReturnType<typeof session.prepare>[] = []

  for (const uuid of duplicateUuids) {
    statements.push(session.prepare(`DELETE FROM wrs WHERE submission_uuid = ?`).bind(uuid))
    statements.push(session.prepare(`DELETE FROM pbs WHERE submission_uuid = ?`).bind(uuid))
    statements.push(session.prepare(`DELETE FROM submissions WHERE uuid = ?`).bind(uuid))
  }

  await session.batch(statements)

  for (const uuid of duplicateUuids) {
    await insertAuditLog(env.wasans, "submission_deleted", "submission", uuid, {
      actor: user,
      details: { reason: "duplicate_removal_v1" },
    })
  }

  return jsonResponse({
    deletedCount: duplicateUuids.length,
    deletedSubmissions: duplicateUuids,
  })
}
