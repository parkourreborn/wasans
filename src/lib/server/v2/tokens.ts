import "server-only"
import { generateOpaqueToken, hashToken } from "./jwt"

// 30 days, matching v1's auth_sessions session length.
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

type RefreshTokenRow = {
  id: string
  family_id: string
  player_uuid: string
  expires_at: number
  revoked_at: number | null
}

export type IssuedRefreshToken = {
  refreshToken: string
  familyId: string
  expiresAt: number
}

async function insertRefreshToken(
  db: D1Database,
  playerUuid: string,
  familyId: string
): Promise<IssuedRefreshToken> {
  const token = generateOpaqueToken()
  const tokenHash = await hashToken(token)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS

  await db.prepare(
    `INSERT INTO refresh_tokens (id, token_hash, family_id, player_uuid, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), tokenHash, familyId, playerUuid, now, expiresAt)
    .run()

  return { refreshToken: token, familyId, expiresAt }
}

// Issues the first refresh token in a new family, used on login.
export async function issueRefreshTokenFamily(db: D1Database, playerUuid: string): Promise<IssuedRefreshToken> {
  return insertRefreshToken(db, playerUuid, crypto.randomUUID())
}

export type RotateResult =
  | { status: "ok"; playerUuid: string; issued: IssuedRefreshToken }
  | { status: "reused"; playerUuid: string }
  | { status: "invalid" }

// Rotates a presented refresh token: revokes it and issues a replacement in
// the same family. If the presented token was already revoked (i.e. it was
// already used once before), that's a signal of token theft/replay — the
// entire family is revoked so both the attacker and the legitimate holder
// are logged out and must re-authenticate.
export async function rotateRefreshToken(db: D1Database, presentedToken: string): Promise<RotateResult> {
  const tokenHash = await hashToken(presentedToken)
  const row = await db.prepare(
    `SELECT id, family_id, player_uuid, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<RefreshTokenRow>()

  if (!row) {
    return { status: "invalid" }
  }

  const now = Math.floor(Date.now() / 1000)

  if (row.revoked_at) {
    await db.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`
    )
      .bind(now, row.family_id)
      .run()

    return { status: "reused", playerUuid: row.player_uuid }
  }

  if (Number(row.expires_at) <= now) {
    return { status: "invalid" }
  }

  const session = db.withSession("first-primary")
  const newId = crypto.randomUUID()
  const token = generateOpaqueToken()
  const tokenHash2 = await hashToken(token)
  const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS

  await session.batch([
    session.prepare(`UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?`)
      .bind(now, newId, row.id),
    session.prepare(
      `INSERT INTO refresh_tokens (id, token_hash, family_id, player_uuid, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId, tokenHash2, row.family_id, row.player_uuid, now, expiresAt),
  ])

  return {
    status: "ok",
    playerUuid: row.player_uuid,
    issued: { refreshToken: token, familyId: row.family_id, expiresAt },
  }
}

export async function revokeRefreshToken(db: D1Database, presentedToken: string) {
  const tokenHash = await hashToken(presentedToken)
  await db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`
  )
    .bind(Math.floor(Date.now() / 1000), tokenHash)
    .run()
}

export async function revokeAllRefreshTokensForPlayer(db: D1Database, playerUuid: string) {
  await db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE player_uuid = ? AND revoked_at IS NULL`
  )
    .bind(Math.floor(Date.now() / 1000), playerUuid)
    .run()
}
