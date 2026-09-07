import "server-only"
import {
  MAX_REPLACEMENT_CHAIN_HOPS,
  REFRESH_TOKEN_TTL_SECONDS,
  isBenignReuse,
} from "@/lib/refresh-rotation"
import { generateOpaqueToken, hashToken } from "./jwt"

type RefreshTokenRow = {
  id: string
  family_id: string
  player_uuid: string
  expires_at: number
  revoked_at: number | null
  replaced_by: string | null
}

const TOKEN_COLUMNS = `id, family_id, player_uuid, expires_at, revoked_at, replaced_by`

// Every read in the rotation path must see the writes of the rotation that
// came just before it. D1 can serve plain reads from a replica that hasn't
// caught up yet, which would make a freshly issued token look like it does
// not exist — reported to the browser as "refresh token invalid", i.e. a
// spurious sign-out. Pinning the whole exchange to the primary removes that
// class of logout entirely.
type TokenSession = Pick<D1DatabaseSession, "prepare" | "batch">

function primarySession(db: D1Database): TokenSession {
  return db.withSession("first-primary")
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

async function rotateActiveToken(
  session: TokenSession,
  row: RefreshTokenRow,
  now: number
): Promise<RotateResult> {
  const newId = crypto.randomUUID()
  const token = generateOpaqueToken()
  const tokenHash = await hashToken(token)
  const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS

  await session.batch([
    session.prepare(`UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?`)
      .bind(now, newId, row.id),
    session.prepare(
      `INSERT INTO refresh_tokens (id, token_hash, family_id, player_uuid, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId, tokenHash, row.family_id, row.player_uuid, now, expiresAt),
  ])

  return {
    status: "ok",
    playerUuid: row.player_uuid,
    issued: { refreshToken: token, familyId: row.family_id, expiresAt },
  }
}

// Follows the replaced_by links forward from an already-rotated token to see
// whether the session it belongs to is still alive. A browser whose refresh
// response never arrived keeps presenting a token one (or, if it keeps
// happening, a few) links behind the live one; that is a dropped connection,
// not an attacker, and the player should stay signed in.
async function findActiveDescendant(
  session: TokenSession,
  row: RefreshTokenRow,
  now: number
): Promise<RefreshTokenRow | null> {
  let current = row

  for (let hop = 0; hop < MAX_REPLACEMENT_CHAIN_HOPS; hop++) {
    if (!current.replaced_by) {
      return null
    }

    const next = await session.prepare(`SELECT ${TOKEN_COLUMNS} FROM refresh_tokens WHERE id = ?`)
      .bind(current.replaced_by)
      .first<RefreshTokenRow>()

    if (!next) {
      return null
    }

    if (!next.revoked_at) {
      return Number(next.expires_at) > now ? next : null
    }

    current = next
  }

  return null
}

// Rotates a presented refresh token: revokes it and issues a replacement in
// the same family. Re-presenting a token that was already rotated away is
// only treated as theft/replay when it cannot be explained as a lost
// response or a race between two tabs (see isBenignReuse) — in that case the
// entire family is revoked so both the attacker and the legitimate holder
// are logged out and must re-authenticate.
export async function rotateRefreshToken(db: D1Database, presentedToken: string): Promise<RotateResult> {
  const session = primarySession(db)
  const tokenHash = await hashToken(presentedToken)
  const row = await session.prepare(`SELECT ${TOKEN_COLUMNS} FROM refresh_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<RefreshTokenRow>()

  if (!row) {
    return { status: "invalid" }
  }

  const now = Math.floor(Date.now() / 1000)

  if (row.revoked_at) {
    const descendant = await findActiveDescendant(session, row, now)

    if (isBenignReuse({ revokedAt: Number(row.revoked_at), now, hasActiveDescendant: Boolean(descendant) })) {
      const active =
        descendant ||
        (await session.prepare(
          `SELECT ${TOKEN_COLUMNS} FROM refresh_tokens WHERE family_id = ? AND revoked_at IS NULL`
        )
          .bind(row.family_id)
          .first<RefreshTokenRow>())

      if (active && Number(active.expires_at) > now) {
        return rotateActiveToken(session, active, now)
      }
    }

    await session.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`
    )
      .bind(now, row.family_id)
      .run()

    return { status: "reused", playerUuid: row.player_uuid }
  }

  if (Number(row.expires_at) <= now) {
    return { status: "invalid" }
  }

  return rotateActiveToken(session, row, now)
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
