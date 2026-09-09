import "server-only"
import { getTrialLifecycle } from "@/lib/server/repositories/trial-repository"
import { getComboCategory } from "@/lib/server/repositories/combo-category-repository"

export type PrizeCriteriaType = "trial_wr" | "combo_wr" | "rankup" | "score_reached"
export type PrizeStatus = "active" | "won" | "closed"

export type PrizeRow = {
  uuid: string
  title: string
  description: string | null
  criteria_type: PrizeCriteriaType
  criteria_trial_name: string | null
  criteria_combo_category_slug: string | null
  criteria_target_role_id: string | null
  criteria_score_target: number | null
  max_winners: number | null
  ends_at: number | null
  status: PrizeStatus
  closed_at: number | null
  closed_by_uuid: string | null
  closed_by_name: string | null
  created_at: number
  created_by_uuid: string | null
  created_by_name: string | null
}

export type PrizeWinnerRow = {
  uuid: string
  prize_uuid: string
  player_uuid: string
  player_name: string
  source: "auto" | "manual"
  candidate_uuid: string | null
  awarded_at: number
  awarded_by_uuid: string | null
  awarded_by_name: string | null
  claimed: number
  claimed_at: number | null
  claimed_by_uuid: string | null
  claimed_by_name: string | null
}

export type PrizeCandidateRow = {
  uuid: string
  prize_uuid: string
  player_uuid: string
  player_name: string
  status: "pending" | "confirmed" | "rejected"
  event_details: string | null
  detected_at: number
  reviewed_at: number | null
  reviewed_by_uuid: string | null
  reviewed_by_name: string | null
  resulting_winner_uuid: string | null
}

export class PrizeError extends Error {
  code: "invalid" | "not_found" | "already_full" | "not_active" | "candidate_not_pending" | "already_won"

  constructor(message: string, code: PrizeError["code"]) {
    super(message)
    this.code = code
  }
}

const PRIZE_COLUMNS = `uuid, title, description, criteria_type, criteria_trial_name, criteria_combo_category_slug,
  criteria_target_role_id, criteria_score_target, max_winners, ends_at, status, closed_at, closed_by_uuid,
  closed_by_name, created_at, created_by_uuid, created_by_name`

export async function listPrizes(db: D1Database, filter: "active" | "history"): Promise<PrizeRow[]> {
  const whereClause = filter === "active" ? `status = 'active'` : `status IN ('won', 'closed')`
  const { results } = await db.prepare(
    `SELECT ${PRIZE_COLUMNS} FROM prizes WHERE ${whereClause} ORDER BY created_at DESC`
  ).all<PrizeRow>()

  return results || []
}

export async function getPrize(db: D1Database, uuid: string): Promise<PrizeRow | null> {
  return db.prepare(`SELECT ${PRIZE_COLUMNS} FROM prizes WHERE uuid = ?`).bind(uuid).first<PrizeRow>()
}

type CreatePrizeInput = {
  title: string
  description?: string | null
  criteriaType: PrizeCriteriaType
  criteriaTrialName?: string | null
  criteriaComboCategorySlug?: string | null
  criteriaTargetRoleId?: string | null
  criteriaScoreTarget?: number | null
  maxWinners?: number | null
  endsAt?: number | null
}

export async function createPrize(
  db: D1Database,
  input: CreatePrizeInput,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<PrizeRow> {
  const title = input.title.trim()
  if (!title) {
    throw new PrizeError("title is required", "invalid")
  }

  if (input.maxWinners != null && (!Number.isInteger(input.maxWinners) || input.maxWinners < 1)) {
    throw new PrizeError("max_winners must be a positive integer or omitted for unlimited", "invalid")
  }

  let criteriaTrialName: string | null = null
  let criteriaComboCategorySlug: string | null = null
  let criteriaTargetRoleId: string | null = null
  let criteriaScoreTarget: number | null = null

  if (input.criteriaType === "trial_wr") {
    if (input.criteriaTrialName) {
      const trial = await getTrialLifecycle(db, input.criteriaTrialName)
      if (!trial) {
        throw new PrizeError(`Trial "${input.criteriaTrialName}" was not found`, "invalid")
      }
      criteriaTrialName = input.criteriaTrialName
    }
  } else if (input.criteriaType === "combo_wr") {
    if (input.criteriaComboCategorySlug) {
      const category = await getComboCategory(db, input.criteriaComboCategorySlug)
      if (!category) {
        throw new PrizeError(`Combo category "${input.criteriaComboCategorySlug}" was not found`, "invalid")
      }
      criteriaComboCategorySlug = input.criteriaComboCategorySlug
    }
  } else if (input.criteriaType === "rankup") {
    criteriaTargetRoleId = input.criteriaTargetRoleId || null
  } else if (input.criteriaType === "score_reached") {
    if (typeof input.criteriaScoreTarget !== "number" || !Number.isFinite(input.criteriaScoreTarget)) {
      throw new PrizeError("criteria_score_target is required for score_reached prizes", "invalid")
    }
    criteriaScoreTarget = input.criteriaScoreTarget
  }

  const uuid = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO prizes (
      uuid, title, description, criteria_type, criteria_trial_name, criteria_combo_category_slug,
      criteria_target_role_id, criteria_score_target, max_winners, ends_at, status, created_at,
      created_by_uuid, created_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  )
    .bind(
      uuid,
      title,
      input.description?.trim() || null,
      input.criteriaType,
      criteriaTrialName,
      criteriaComboCategorySlug,
      criteriaTargetRoleId,
      criteriaScoreTarget,
      input.maxWinners ?? null,
      input.endsAt ?? null,
      nowSeconds,
      actor.uuid,
      actor.player_name
    )
    .run()

  const created = await getPrize(db, uuid)
  if (!created) {
    throw new PrizeError("Failed to create prize", "invalid")
  }

  return created
}

export async function closePrize(
  db: D1Database,
  uuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<PrizeRow> {
  const prize = await getPrize(db, uuid)
  if (!prize) {
    throw new PrizeError(`Prize "${uuid}" was not found`, "not_found")
  }

  await db.prepare(
    `UPDATE prizes SET status = 'closed', closed_at = ?, closed_by_uuid = ?, closed_by_name = ? WHERE uuid = ?`
  ).bind(nowSeconds, actor.uuid, actor.player_name, uuid).run()

  const updated = await getPrize(db, uuid)
  if (!updated) {
    throw new PrizeError("Failed to close prize", "invalid")
  }

  return updated
}

export async function extendPrizeDeadline(db: D1Database, uuid: string, endsAt: number | null): Promise<PrizeRow> {
  const prize = await getPrize(db, uuid)
  if (!prize) {
    throw new PrizeError(`Prize "${uuid}" was not found`, "not_found")
  }

  await db.prepare(`UPDATE prizes SET ends_at = ? WHERE uuid = ?`).bind(endsAt, uuid).run()

  const updated = await getPrize(db, uuid)
  if (!updated) {
    throw new PrizeError("Failed to update prize", "invalid")
  }

  return updated
}

export async function listPrizeWinners(db: D1Database, prizeUuid: string): Promise<PrizeWinnerRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM prize_winners WHERE prize_uuid = ? ORDER BY awarded_at ASC`
  ).bind(prizeUuid).all<PrizeWinnerRow>()

  return results || []
}

async function countPrizeWinners(db: D1Database, prizeUuid: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM prize_winners WHERE prize_uuid = ?`)
    .bind(prizeUuid)
    .first<{ count: number }>()

  return Number(row?.count ?? 0)
}

// Flips a capped prize to 'won' once it's full. Unlimited prizes (max_winners
// null) never auto-transition -- only a manual close.
async function syncPrizeFullStatus(db: D1Database, prize: PrizeRow): Promise<void> {
  if (prize.max_winners == null || prize.status === "closed") {
    return
  }

  const winnerCount = await countPrizeWinners(db, prize.uuid)
  const nextStatus: PrizeStatus = winnerCount >= prize.max_winners ? "won" : "active"

  if (nextStatus !== prize.status) {
    await db.prepare(`UPDATE prizes SET status = ? WHERE uuid = ?`).bind(nextStatus, prize.uuid).run()
  }
}

async function insertPrizeWinner(
  db: D1Database,
  prize: PrizeRow,
  input: { playerUuid: string; playerName: string; source: "auto" | "manual"; candidateUuid?: string | null },
  actor: { uuid: string; player_name: string } | null,
  nowSeconds: number
): Promise<PrizeWinnerRow> {
  if (prize.status === "closed") {
    throw new PrizeError("This prize is closed", "not_active")
  }

  const existingWinner = await db.prepare(`SELECT uuid FROM prize_winners WHERE prize_uuid = ? AND player_uuid = ?`)
    .bind(prize.uuid, input.playerUuid)
    .first<{ uuid: string }>()

  if (existingWinner) {
    throw new PrizeError("This player has already won this prize", "already_won")
  }

  if (prize.max_winners != null) {
    const winnerCount = await countPrizeWinners(db, prize.uuid)
    if (winnerCount >= prize.max_winners) {
      throw new PrizeError("This prize already has its full number of winners", "already_full")
    }
  }

  const uuid = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO prize_winners (
      uuid, prize_uuid, player_uuid, player_name, source, candidate_uuid, awarded_at, awarded_by_uuid, awarded_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uuid,
      prize.uuid,
      input.playerUuid,
      input.playerName,
      input.source,
      input.candidateUuid ?? null,
      nowSeconds,
      actor?.uuid ?? null,
      actor?.player_name ?? null
    )
    .run()

  await syncPrizeFullStatus(db, prize)

  const created = await db.prepare(`SELECT * FROM prize_winners WHERE uuid = ?`).bind(uuid).first<PrizeWinnerRow>()
  if (!created) {
    throw new PrizeError("Failed to add prize winner", "invalid")
  }

  return created
}

export async function addManualPrizeWinner(
  db: D1Database,
  prizeUuid: string,
  playerUuid: string,
  playerName: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<PrizeWinnerRow> {
  const prize = await getPrize(db, prizeUuid)
  if (!prize) {
    throw new PrizeError(`Prize "${prizeUuid}" was not found`, "not_found")
  }

  return insertPrizeWinner(db, prize, { playerUuid, playerName, source: "manual" }, actor, nowSeconds)
}

// Deletes the winner row (freeing the slot) and flips a full prize back to
// active. Returns the updated prize.
export async function removePrizeWinner(db: D1Database, winnerUuid: string): Promise<PrizeRow> {
  const winner = await db.prepare(`SELECT * FROM prize_winners WHERE uuid = ?`).bind(winnerUuid).first<PrizeWinnerRow>()
  if (!winner) {
    throw new PrizeError(`Prize winner "${winnerUuid}" was not found`, "not_found")
  }

  await db.prepare(`DELETE FROM prize_winners WHERE uuid = ?`).bind(winnerUuid).run()

  const prize = await getPrize(db, winner.prize_uuid)
  if (!prize) {
    throw new PrizeError("Prize was not found", "not_found")
  }

  await syncPrizeFullStatus(db, prize)

  const updated = await getPrize(db, winner.prize_uuid)
  if (!updated) {
    throw new PrizeError("Failed to update prize", "invalid")
  }

  return updated
}

export async function markPrizeWinnerClaimed(
  db: D1Database,
  winnerUuid: string,
  claimed: boolean,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<PrizeWinnerRow> {
  const winner = await db.prepare(`SELECT * FROM prize_winners WHERE uuid = ?`).bind(winnerUuid).first<PrizeWinnerRow>()
  if (!winner) {
    throw new PrizeError(`Prize winner "${winnerUuid}" was not found`, "not_found")
  }

  await db.prepare(
    `UPDATE prize_winners SET claimed = ?, claimed_at = ?, claimed_by_uuid = ?, claimed_by_name = ? WHERE uuid = ?`
  )
    .bind(claimed ? 1 : 0, claimed ? nowSeconds : null, claimed ? actor.uuid : null, claimed ? actor.player_name : null, winnerUuid)
    .run()

  const updated = await db.prepare(`SELECT * FROM prize_winners WHERE uuid = ?`).bind(winnerUuid).first<PrizeWinnerRow>()
  if (!updated) {
    throw new PrizeError("Failed to update prize winner", "invalid")
  }

  return updated
}

export async function listPendingPrizeCandidates(db: D1Database): Promise<PrizeCandidateRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM prize_candidates WHERE status = 'pending' ORDER BY detected_at ASC`
  ).all<PrizeCandidateRow>()

  return results || []
}

export async function countPendingPrizeCandidates(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM prize_candidates WHERE status = 'pending'`)
    .first<{ count: number }>()

  return Number(row?.count ?? 0)
}

// Self-dedupes: no-ops (returns null) if the player already has a
// pending/confirmed candidate, or a live winner row, for this prize.
export async function createPrizeCandidate(
  db: D1Database,
  input: { prizeUuid: string; playerUuid: string; playerName: string; eventDetails?: unknown; nowSeconds: number }
): Promise<PrizeCandidateRow | null> {
  const existingCandidate = await db.prepare(
    `SELECT uuid FROM prize_candidates WHERE prize_uuid = ? AND player_uuid = ? AND status IN ('pending', 'confirmed')`
  ).bind(input.prizeUuid, input.playerUuid).first<{ uuid: string }>()

  if (existingCandidate) {
    return null
  }

  const existingWinner = await db.prepare(
    `SELECT uuid FROM prize_winners WHERE prize_uuid = ? AND player_uuid = ?`
  ).bind(input.prizeUuid, input.playerUuid).first<{ uuid: string }>()

  if (existingWinner) {
    return null
  }

  const uuid = crypto.randomUUID()
  const eventDetails = input.eventDetails == null ? null : JSON.stringify(input.eventDetails)

  await db.prepare(
    `INSERT INTO prize_candidates (uuid, prize_uuid, player_uuid, player_name, status, event_details, detected_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(uuid, input.prizeUuid, input.playerUuid, input.playerName, eventDetails, input.nowSeconds)
    .run()

  return db.prepare(`SELECT * FROM prize_candidates WHERE uuid = ?`).bind(uuid).first<PrizeCandidateRow>()
}

export async function confirmPrizeCandidate(
  db: D1Database,
  candidateUuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<{ candidate: PrizeCandidateRow; winner: PrizeWinnerRow; prize: PrizeRow }> {
  const candidate = await db.prepare(`SELECT * FROM prize_candidates WHERE uuid = ?`)
    .bind(candidateUuid)
    .first<PrizeCandidateRow>()

  if (!candidate) {
    throw new PrizeError(`Prize candidate "${candidateUuid}" was not found`, "not_found")
  }

  if (candidate.status !== "pending") {
    throw new PrizeError("This candidate has already been reviewed", "candidate_not_pending")
  }

  const prize = await getPrize(db, candidate.prize_uuid)
  if (!prize) {
    throw new PrizeError("Prize was not found", "not_found")
  }

  const winner = await insertPrizeWinner(
    db,
    prize,
    { playerUuid: candidate.player_uuid, playerName: candidate.player_name, source: "auto", candidateUuid: candidate.uuid },
    actor,
    nowSeconds
  )

  await db.prepare(
    `UPDATE prize_candidates SET status = 'confirmed', reviewed_at = ?, reviewed_by_uuid = ?, reviewed_by_name = ?, resulting_winner_uuid = ? WHERE uuid = ?`
  ).bind(nowSeconds, actor.uuid, actor.player_name, winner.uuid, candidateUuid).run()

  const updatedCandidate = await db.prepare(`SELECT * FROM prize_candidates WHERE uuid = ?`)
    .bind(candidateUuid)
    .first<PrizeCandidateRow>()
  const updatedPrize = await getPrize(db, candidate.prize_uuid)

  if (!updatedCandidate || !updatedPrize) {
    throw new PrizeError("Failed to confirm candidate", "invalid")
  }

  return { candidate: updatedCandidate, winner, prize: updatedPrize }
}

export async function rejectPrizeCandidate(
  db: D1Database,
  candidateUuid: string,
  actor: { uuid: string; player_name: string },
  nowSeconds: number
): Promise<PrizeCandidateRow> {
  const candidate = await db.prepare(`SELECT * FROM prize_candidates WHERE uuid = ?`)
    .bind(candidateUuid)
    .first<PrizeCandidateRow>()

  if (!candidate) {
    throw new PrizeError(`Prize candidate "${candidateUuid}" was not found`, "not_found")
  }

  if (candidate.status !== "pending") {
    throw new PrizeError("This candidate has already been reviewed", "candidate_not_pending")
  }

  await db.prepare(
    `UPDATE prize_candidates SET status = 'rejected', reviewed_at = ?, reviewed_by_uuid = ?, reviewed_by_name = ? WHERE uuid = ?`
  ).bind(nowSeconds, actor.uuid, actor.player_name, candidateUuid).run()

  const updated = await db.prepare(`SELECT * FROM prize_candidates WHERE uuid = ?`).bind(candidateUuid).first<PrizeCandidateRow>()
  if (!updated) {
    throw new PrizeError("Failed to reject candidate", "invalid")
  }

  return updated
}

// --- Narrow reads used only by prize-candidate-checker.ts ---

export async function listActiveTrialWrPrizes(db: D1Database, trialName: string): Promise<PrizeRow[]> {
  const { results } = await db.prepare(
    `SELECT ${PRIZE_COLUMNS} FROM prizes
     WHERE status = 'active' AND criteria_type = 'trial_wr'
       AND (criteria_trial_name IS NULL OR criteria_trial_name = ?)`
  ).bind(trialName).all<PrizeRow>()

  return results || []
}

export async function listActiveComboWrPrizes(db: D1Database, categorySlug: string): Promise<PrizeRow[]> {
  const { results } = await db.prepare(
    `SELECT ${PRIZE_COLUMNS} FROM prizes
     WHERE status = 'active' AND criteria_type = 'combo_wr'
       AND (criteria_combo_category_slug IS NULL OR criteria_combo_category_slug = ?)`
  ).bind(categorySlug).all<PrizeRow>()

  return results || []
}

export async function listActiveScoreReachedPrizes(db: D1Database): Promise<PrizeRow[]> {
  const { results } = await db.prepare(
    `SELECT ${PRIZE_COLUMNS} FROM prizes WHERE status = 'active' AND criteria_type = 'score_reached'`
  ).all<PrizeRow>()

  return results || []
}

export async function listActiveRankupPrizes(db: D1Database): Promise<PrizeRow[]> {
  const { results } = await db.prepare(
    `SELECT ${PRIZE_COLUMNS} FROM prizes WHERE status = 'active' AND criteria_type = 'rankup'`
  ).all<PrizeRow>()

  return results || []
}
