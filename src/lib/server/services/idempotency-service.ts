import "server-only"

type IdempotencyRecord = {
  request_hash: string
  response_json: string
  status_code: number
  expires_at: number
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function readIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim()
  if (!key) {
    return null
  }

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    return null
  }

  return key
}

export async function buildRequestHash(scope: string, actorUuid: string, payload: string) {
  return sha256Hex(`${scope}:${actorUuid}:${payload}`)
}

export async function lookupIdempotentResponse(
  db: D1Database,
  input: {
    scope: string
    idempotencyKey: string
    actorUuid: string
    requestHash: string
  }
) {
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(`DELETE FROM api_idempotency_keys WHERE expires_at <= ?`).bind(now).run()

  const existing = await db.prepare(
    `SELECT request_hash, response_json, status_code, expires_at
     FROM api_idempotency_keys
     WHERE scope = ?
       AND idempotency_key = ?
       AND actor_uuid = ?`
  )
    .bind(input.scope, input.idempotencyKey, input.actorUuid)
    .first<IdempotencyRecord>()

  if (!existing) {
    return { hit: false as const }
  }

  if (existing.request_hash !== input.requestHash) {
    return { hit: false as const, conflict: true as const }
  }

  return {
    hit: true as const,
    responseJson: existing.response_json,
    statusCode: Number(existing.status_code),
  }
}

export async function storeIdempotentResponse(
  db: D1Database,
  input: {
    scope: string
    idempotencyKey: string
    actorUuid: string
    requestHash: string
    responseJson: string
    statusCode: number
    ttlSeconds: number
  }
) {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + input.ttlSeconds

  await db.prepare(
    `INSERT INTO api_idempotency_keys (
      scope, idempotency_key, actor_uuid, request_hash, response_json, status_code, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, idempotency_key, actor_uuid) DO UPDATE SET
      request_hash = excluded.request_hash,
      response_json = excluded.response_json,
      status_code = excluded.status_code,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at`
  )
    .bind(
      input.scope,
      input.idempotencyKey,
      input.actorUuid,
      input.requestHash,
      input.responseJson,
      input.statusCode,
      now,
      expiresAt
    )
    .run()
}
