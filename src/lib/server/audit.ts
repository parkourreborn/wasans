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
  | "site_error"

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

type SiteErrorLogInput = {
  source: "client" | "client_console" | "server" | "server_console"
  message: string
  name?: string | null
  stack?: string | null
  path?: string | null
  method?: string | null
  userAgent?: string | null
  details?: Record<string, unknown>
  actor?: AuditActor | null
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function serializeErrorDetails(input: SiteErrorLogInput) {
  return {
    severity: "error",
    source: input.source,
    message: limitText(input.message, 1000) || "Unknown error",
    name: limitText(input.name, 200),
    stack: limitText(input.stack, 8000),
    path: limitText(input.path, 1000),
    method: limitText(input.method, 20),
    userAgent: limitText(input.userAgent, 500),
    ...(input.details || {}),
  }
}

export function errorToLogInput(
  error: unknown,
  source: SiteErrorLogInput["source"],
  details?: Omit<SiteErrorLogInput, "source" | "message" | "name" | "stack" | "details"> & {
    details?: Record<string, unknown>
  }
): SiteErrorLogInput {
  if (error instanceof Error) {
    return {
      source,
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...details,
    }
  }

  return {
    source,
    message: typeof error === "string" ? error : JSON.stringify(error),
    ...details,
  }
}

export async function insertSiteErrorLog(db: D1Database, input: SiteErrorLogInput) {
  await insertAuditLog(db, "site_error", "site_error", null, {
    actor: input.actor,
    details: serializeErrorDetails(input),
  })
}
