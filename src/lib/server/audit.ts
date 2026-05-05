import type { AuthUser } from "./auth"

export type AuditActor = Pick<AuthUser, "uuid" | "player_name">

export type AuditAction =
  | "submission_created"
  | "submission_updated"
  | "submission_approved"
  | "submission_denied"
  | "submission_deleted"
  | "wr_created"
  | "wr_deleted"
  | "wr_changed"

export async function insertAuditLog(
  db: D1Database,
  action: AuditAction,
  entityType: string,
  entityUuid: string | null,
  options?: {
    actor?: AuditActor | null
    targetType?: string | null
    targetUuid?: string | null
    details?: unknown
  }
) {
  const actorUuid = options?.actor?.uuid ?? null
  const actorName = options?.actor?.player_name ?? null
  const details = options?.details == null ? null : JSON.stringify(options.details)

  await db.prepare(
    `INSERT INTO audit_logs (
      actor_uuid,
      actor_name,
      action,
      entity_type,
      entity_uuid,
      target_type,
      target_uuid,
      details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(actorUuid, actorName, action, entityType, entityUuid, options?.targetType ?? null, options?.targetUuid ?? null, details)
    .run()
}
