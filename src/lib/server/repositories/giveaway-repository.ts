import "server-only"

export type GiveawayStatus = "active" | "won" | "closed"

export type GiveawayRow = {
  uuid: string
  title: string
  description: string | null
  max_winners: number
  ends_at: number
  status: GiveawayStatus
  closed_at: number | null
  closed_by_uuid: string | null
  closed_by_name: string | null
  created_at: number
  created_by_uuid: string | null
  created_by_name: string | null
  discord_channel_id: string | null
  discord_message_id: string | null
}

export type GiveawayEntryRow = {
  giveaway_uuid: string
  player_uuid: string
  player_name: string
  entered_at: number
}

export type GiveawayWinnerRow = {
  uuid: string
  giveaway_uuid: string
  player_uuid: string
  player_name: string
  round: number
  is_current: number
  drawn_at: number
  drawn_by_uuid: string | null
  drawn_by_name: string | null
  claimed: number
  claimed_at: number | null
  claimed_by_uuid: string | null
  claimed_by_name: string | null
}

export class GiveawayError extends Error {
  code: "invalid" | "not_found" | "already_entered" | "not_active" | "no_entrants"

  constructor(message: string, code: GiveawayError["code"]) {
    super(message)
    this.code = code
  }
}

const GIVEAWAY_COLUMNS = `uuid, title, description, max_winners, ends_at, status, closed_at, closed_by_uuid,
  closed_by_name, created_at, created_by_uuid, created_by_name, discord_channel_id, discord_message_id`

export async function listGiveaways(db: D1Database, filter: "active" | "history"): Promise<GiveawayRow[]> {
  const whereClause = filter === "active" ? `status = 'active'` : `status IN ('won', 'closed')`
  const { results } = await db.prepare(
    `SELECT ${GIVEAWAY_COLUMNS} FROM giveaways WHERE ${whereClause} ORDER BY created_at DESC`
  ).all<GiveawayRow>()

  return results || []
}

export async function getGiveaway(db: D1Database, uuid: string): Promise<GiveawayRow | null> {
  return db.prepare(`SELECT ${GIVEAWAY_COLUMNS} FROM giveaways WHERE uuid = ?`).bind(uuid).first<GiveawayRow>()
}

// Records which Discord message the bot posted/edited for this giveaway so
// notifyGiveawayChanged knows to edit it in place on the next state change
// instead of posting a duplicate. See migration 0014.
export async function setGiveawayDiscordMessage(
  db: D1Database,
  uuid: string,
  channelId: string,
  messageId: string
): Promise<void> {
  await db.prepare(`UPDATE giveaways SET discord_channel_id = ?, discord_message_id = ? WHERE uuid = ?`)
    .bind(channelId, messageId, uuid)
    .run()
}

export async function createGiveaway(
  db: D1Database,
  input: { title: string; description?: string | null; maxWinners: number; endsAt: number },
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<GiveawayRow> {
  const title = input.title.trim()
  if (!title) {
    throw new GiveawayError("title is required", "invalid")
  }

  if (!Number.isInteger(input.maxWinners) || input.maxWinners < 1) {
    throw new GiveawayError("max_winners must be a positive integer", "invalid")
  }

  if (!Number.isFinite(input.endsAt)) {
    throw new GiveawayError("ends_at (unix seconds) is required", "invalid")
  }

  const uuid = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO giveaways (uuid, title, description, max_winners, ends_at, status, created_at, created_by_uuid, created_by_name)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  )
    .bind(uuid, title, input.description?.trim() || null, input.maxWinners, input.endsAt, nowSeconds, actor.uuid, actor.player_name)
    .run()

  const created = await getGiveaway(db, uuid)
  if (!created) {
    throw new GiveawayError("Failed to create giveaway", "invalid")
  }

  return created
}

export async function closeGiveaway(
  db: D1Database,
  uuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<GiveawayRow> {
  const giveaway = await getGiveaway(db, uuid)
  if (!giveaway) {
    throw new GiveawayError(`Giveaway "${uuid}" was not found`, "not_found")
  }

  await db.prepare(
    `UPDATE giveaways SET status = 'closed', closed_at = ?, closed_by_uuid = ?, closed_by_name = ? WHERE uuid = ?`
  ).bind(nowSeconds, actor.uuid, actor.player_name, uuid).run()

  const updated = await getGiveaway(db, uuid)
  if (!updated) {
    throw new GiveawayError("Failed to close giveaway", "invalid")
  }

  return updated
}

export async function extendGiveawayDeadline(db: D1Database, uuid: string, endsAt: number): Promise<GiveawayRow> {
  const giveaway = await getGiveaway(db, uuid)
  if (!giveaway) {
    throw new GiveawayError(`Giveaway "${uuid}" was not found`, "not_found")
  }

  if (!Number.isFinite(endsAt)) {
    throw new GiveawayError("ends_at (unix seconds) is required", "invalid")
  }

  await db.prepare(`UPDATE giveaways SET ends_at = ? WHERE uuid = ?`).bind(endsAt, uuid).run()

  const updated = await getGiveaway(db, uuid)
  if (!updated) {
    throw new GiveawayError("Failed to update giveaway", "invalid")
  }

  return updated
}

export async function hasPlayerEnteredGiveaway(db: D1Database, giveawayUuid: string, playerUuid: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM giveaway_entries WHERE giveaway_uuid = ? AND player_uuid = ?`)
    .bind(giveawayUuid, playerUuid)
    .first()

  return Boolean(row)
}

export async function countGiveawayEntries(db: D1Database, giveawayUuid: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM giveaway_entries WHERE giveaway_uuid = ?`)
    .bind(giveawayUuid)
    .first<{ count: number }>()

  return Number(row?.count ?? 0)
}

export async function listGiveawayEntries(db: D1Database, giveawayUuid: string): Promise<GiveawayEntryRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM giveaway_entries WHERE giveaway_uuid = ? ORDER BY entered_at ASC`
  ).bind(giveawayUuid).all<GiveawayEntryRow>()

  return results || []
}

export async function joinGiveaway(
  db: D1Database,
  giveawayUuid: string,
  playerUuid: string,
  playerName: string,
  nowSeconds: number
): Promise<GiveawayEntryRow> {
  const giveaway = await getGiveaway(db, giveawayUuid)
  if (!giveaway) {
    throw new GiveawayError(`Giveaway "${giveawayUuid}" was not found`, "not_found")
  }

  if (giveaway.status !== "active") {
    throw new GiveawayError("This giveaway is no longer accepting entries", "not_active")
  }

  const alreadyEntered = await hasPlayerEnteredGiveaway(db, giveawayUuid, playerUuid)
  if (alreadyEntered) {
    throw new GiveawayError("You have already joined this giveaway", "already_entered")
  }

  await db.prepare(
    `INSERT INTO giveaway_entries (giveaway_uuid, player_uuid, player_name, entered_at) VALUES (?, ?, ?, ?)`
  ).bind(giveawayUuid, playerUuid, playerName, nowSeconds).run()

  const entry = await db.prepare(`SELECT * FROM giveaway_entries WHERE giveaway_uuid = ? AND player_uuid = ?`)
    .bind(giveawayUuid, playerUuid)
    .first<GiveawayEntryRow>()

  if (!entry) {
    throw new GiveawayError("Failed to join giveaway", "invalid")
  }

  return entry
}

export async function listCurrentGiveawayWinners(db: D1Database, giveawayUuid: string): Promise<GiveawayWinnerRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM giveaway_winners WHERE giveaway_uuid = ? AND is_current = 1 ORDER BY drawn_at ASC`
  ).bind(giveawayUuid).all<GiveawayWinnerRow>()

  return results || []
}

export async function listGiveawayWinnerHistory(db: D1Database, giveawayUuid: string): Promise<GiveawayWinnerRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM giveaway_winners WHERE giveaway_uuid = ? ORDER BY round ASC, drawn_at ASC`
  ).bind(giveawayUuid).all<GiveawayWinnerRow>()

  return results || []
}

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []

  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(index, 1)[0])
  }

  return picked
}

export async function drawGiveawayWinners(
  db: D1Database,
  giveawayUuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<GiveawayWinnerRow[]> {
  const giveaway = await getGiveaway(db, giveawayUuid)
  if (!giveaway) {
    throw new GiveawayError(`Giveaway "${giveawayUuid}" was not found`, "not_found")
  }

  if (giveaway.status !== "active") {
    throw new GiveawayError("This giveaway has already been drawn or closed", "not_active")
  }

  const entries = await listGiveawayEntries(db, giveawayUuid)
  if (entries.length === 0) {
    throw new GiveawayError("This giveaway has no entrants", "no_entrants")
  }

  const winners = pickRandom(entries, giveaway.max_winners)

  const statements = winners.map((entry) =>
    db.prepare(
      `INSERT INTO giveaway_winners (uuid, giveaway_uuid, player_uuid, player_name, round, is_current, drawn_at, drawn_by_uuid, drawn_by_name)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)`
    ).bind(crypto.randomUUID(), giveawayUuid, entry.player_uuid, entry.player_name, nowSeconds, actor.uuid, actor.player_name)
  )
  statements.push(db.prepare(`UPDATE giveaways SET status = 'won' WHERE uuid = ?`).bind(giveawayUuid))

  await db.batch(statements)

  return listCurrentGiveawayWinners(db, giveawayUuid)
}

export async function rerollGiveawayWinners(
  db: D1Database,
  giveawayUuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<GiveawayWinnerRow[]> {
  const giveaway = await getGiveaway(db, giveawayUuid)
  if (!giveaway) {
    throw new GiveawayError(`Giveaway "${giveawayUuid}" was not found`, "not_found")
  }

  if (giveaway.status !== "won") {
    throw new GiveawayError("This giveaway hasn't been drawn yet", "not_active")
  }

  const history = await listGiveawayWinnerHistory(db, giveawayUuid)
  const everWonUuids = new Set(history.map((row) => row.player_uuid))
  const currentRound = history.reduce((max, row) => Math.max(max, row.round), 0)

  const entries = await listGiveawayEntries(db, giveawayUuid)
  const eligible = entries.filter((entry) => !everWonUuids.has(entry.player_uuid))

  if (eligible.length === 0) {
    throw new GiveawayError("No eligible entrants remain to reroll (everyone left has already won)", "no_entrants")
  }

  // A partial round (fewer than max_winners) is drawn if the eligible pool
  // has run low, rather than erroring -- an otherwise-valid reroll shouldn't
  // be blocked just because the pool is nearly exhausted.
  const winners = pickRandom(eligible, giveaway.max_winners)
  const nextRound = currentRound + 1

  const statements = [
    db.prepare(`UPDATE giveaway_winners SET is_current = 0 WHERE giveaway_uuid = ?`).bind(giveawayUuid),
    ...winners.map((entry) =>
      db.prepare(
        `INSERT INTO giveaway_winners (uuid, giveaway_uuid, player_uuid, player_name, round, is_current, drawn_at, drawn_by_uuid, drawn_by_name)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(crypto.randomUUID(), giveawayUuid, entry.player_uuid, entry.player_name, nextRound, nowSeconds, actor.uuid, actor.player_name)
    ),
  ]

  await db.batch(statements)

  return listCurrentGiveawayWinners(db, giveawayUuid)
}

export async function markGiveawayWinnerClaimed(
  db: D1Database,
  winnerUuid: string,
  claimed: boolean,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<GiveawayWinnerRow> {
  const winner = await db.prepare(`SELECT * FROM giveaway_winners WHERE uuid = ?`).bind(winnerUuid).first<GiveawayWinnerRow>()
  if (!winner) {
    throw new GiveawayError(`Giveaway winner "${winnerUuid}" was not found`, "not_found")
  }

  await db.prepare(
    `UPDATE giveaway_winners SET claimed = ?, claimed_at = ?, claimed_by_uuid = ?, claimed_by_name = ? WHERE uuid = ?`
  )
    .bind(claimed ? 1 : 0, claimed ? nowSeconds : null, claimed ? actor.uuid : null, claimed ? actor.player_name : null, winnerUuid)
    .run()

  const updated = await db.prepare(`SELECT * FROM giveaway_winners WHERE uuid = ?`).bind(winnerUuid).first<GiveawayWinnerRow>()
  if (!updated) {
    throw new GiveawayError("Failed to update giveaway winner", "invalid")
  }

  return updated
}
