import "server-only"

export type AnnouncementRow = {
  uuid: string
  body: string
  link_url: string | null
  expires_at: number | null
  created_at: number
  created_by_uuid: string | null
  created_by_name: string | null
}

export class AnnouncementError extends Error {
  code: "invalid" | "not_found"

  constructor(message: string, code: AnnouncementError["code"]) {
    super(message)
    this.code = code
  }
}

const ANNOUNCEMENT_COLUMNS = `uuid, body, link_url, expires_at, created_at, created_by_uuid, created_by_name`

// Active + undismissed-by-viewer feed for the banner. playerUuid is null for
// logged-out viewers -- they see every non-expired announcement (dismissal
// requires an account, per the confirmed per-account requirement).
export async function listActiveAnnouncementsForViewer(
  db: D1Database,
  playerUuid: string | null,
  nowSeconds: number
): Promise<AnnouncementRow[]> {
  if (!playerUuid) {
    const { results } = await db.prepare(
      `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements
       WHERE expires_at IS NULL OR expires_at > ?
       ORDER BY created_at DESC`
    ).bind(nowSeconds).all<AnnouncementRow>()

    return results || []
  }

  const { results } = await db.prepare(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements a
     WHERE (a.expires_at IS NULL OR a.expires_at > ?)
       AND NOT EXISTS (
         SELECT 1 FROM announcement_dismissals d
         WHERE d.announcement_uuid = a.uuid AND d.player_uuid = ?
       )
     ORDER BY a.created_at DESC`
  ).bind(nowSeconds, playerUuid).all<AnnouncementRow>()

  return results || []
}

// Full list incl. expired, for the admin management section.
export async function listAllAnnouncements(db: D1Database): Promise<AnnouncementRow[]> {
  const { results } = await db.prepare(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements ORDER BY created_at DESC`
  ).all<AnnouncementRow>()

  return results || []
}

export async function getAnnouncement(db: D1Database, uuid: string): Promise<AnnouncementRow | null> {
  return db.prepare(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM announcements WHERE uuid = ?`
  ).bind(uuid).first<AnnouncementRow>()
}

export async function createAnnouncement(
  db: D1Database,
  input: { body: string; linkUrl?: string | null; expiresAt?: number | null },
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<AnnouncementRow> {
  const body = input.body.trim()
  if (!body) {
    throw new AnnouncementError("body is required", "invalid")
  }

  const uuid = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO announcements (uuid, body, link_url, expires_at, created_at, created_by_uuid, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uuid, body, input.linkUrl?.trim() || null, input.expiresAt ?? null, nowSeconds, actor.uuid, actor.player_name)
    .run()

  const created = await getAnnouncement(db, uuid)
  if (!created) {
    throw new AnnouncementError("Failed to create announcement", "invalid")
  }

  return created
}

export async function deleteAnnouncement(db: D1Database, uuid: string): Promise<void> {
  const existing = await getAnnouncement(db, uuid)
  if (!existing) {
    throw new AnnouncementError(`Announcement "${uuid}" was not found`, "not_found")
  }

  await db.prepare(`DELETE FROM announcements WHERE uuid = ?`).bind(uuid).run()
}

export async function dismissAnnouncement(
  db: D1Database,
  announcementUuid: string,
  playerUuid: string,
  nowSeconds: number
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO announcement_dismissals (announcement_uuid, player_uuid, dismissed_at)
     VALUES (?, ?, ?)`
  ).bind(announcementUuid, playerUuid, nowSeconds).run()
}
