import "server-only"
import { trials as knownTrialNames } from "@/lib/trials"
import { TRIAL_GRACE_PERIOD_SECONDS, type TrialLifecycle } from "@/lib/server/trial-lifecycle"

export type TrialLifecycleRow = TrialLifecycle & { name: string; sort_order: number }

export async function getTrialLifecycle(db: D1Database, trialName: string): Promise<TrialLifecycleRow | null> {
  return db.prepare(
    `SELECT name, status, added_at, version, version_changed_at, removed_at, sort_order
     FROM trials
     WHERE name = ?`
  )
    .bind(trialName)
    .first<TrialLifecycleRow>()
}

// How many trials currently participate in the score average — active
// trials past their "just added" grace period, plus removed trials still
// inside their post-removal grace period. Shared by player-scores.ts and
// the WR-change average-score-delta calculation so both agree on the
// denominator.
export async function getCountedTrialCount(db: D1Database, nowSeconds: number): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM trials
     WHERE (status = 'active' AND ? >= added_at + ${TRIAL_GRACE_PERIOD_SECONDS})
        OR (status = 'removed' AND removed_at IS NOT NULL AND ? < removed_at + ${TRIAL_GRACE_PERIOD_SECONDS})`
  )
    .bind(nowSeconds, nowSeconds)
    .first<{ count: number }>()

  return Number(row?.count ?? 0)
}

export async function listTrialLifecycles(db: D1Database): Promise<TrialLifecycleRow[]> {
  const { results } = await db.prepare(
    `SELECT name, status, added_at, version, version_changed_at, removed_at, sort_order
     FROM trials
     ORDER BY sort_order ASC, name ASC`
  ).all<TrialLifecycleRow>()

  return results || []
}

// Slim public view for pages that only need display order (calculator,
// compare, WRs, submissions/trials) — deliberately excludes lifecycle
// fields those pages have no use for.
export type TrialOrderRow = { name: string; sort_order: number }

export async function listPublicTrialOrder(db: D1Database): Promise<TrialOrderRow[]> {
  const { results } = await db.prepare(
    `SELECT name, sort_order
     FROM trials
     ORDER BY sort_order ASC, name ASC`
  ).all<TrialOrderRow>()

  return results || []
}

export class TrialLifecycleError extends Error {
  code: "unknown_trial" | "already_exists" | "not_found" | "not_active" | "not_removed" | "not_bumped"

  constructor(message: string, code: TrialLifecycleError["code"]) {
    super(message)
    this.code = code
  }
}

// Registers lifecycle tracking for a trial and starts its "just added" grace
// clock. The name must already be one of the hardcoded trial names in
// src/lib/trials.ts (that's where its bronze/platinum score thresholds live)
// — this only starts the timer, it can't invent a brand new scored trial by
// itself, since there'd be no threshold data for calculateScore to use.
export async function createTrial(db: D1Database, trialName: string, nowSeconds: number) {
  if (!knownTrialNames.includes(trialName as (typeof knownTrialNames)[number])) {
    throw new TrialLifecycleError(
      `"${trialName}" isn't in src/lib/trials.ts yet — add its name and score thresholds there and deploy before activating it.`,
      "unknown_trial"
    )
  }

  const existing = await getTrialLifecycle(db, trialName)
  if (existing) {
    throw new TrialLifecycleError(`Trial "${trialName}" already exists.`, "already_exists")
  }

  // New trials are appended to the end of the display order.
  const maxOrderRow = await db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM trials`).first<{ max_order: number }>()
  const nextSortOrder = Number(maxOrderRow?.max_order ?? -1) + 1

  await db.prepare(
    `INSERT INTO trials (name, status, added_at, version, sort_order) VALUES (?, 'active', ?, 1, ?)`
  )
    .bind(trialName, nowSeconds, nextSortOrder)
    .run()
}

export async function retireTrial(db: D1Database, trialName: string, nowSeconds: number) {
  const existing = await getTrialLifecycle(db, trialName)
  if (!existing) {
    throw new TrialLifecycleError(`Trial "${trialName}" was not found.`, "not_found")
  }
  if (existing.status !== "active") {
    throw new TrialLifecycleError(`Trial "${trialName}" is not active.`, "not_active")
  }

  await db.prepare(`UPDATE trials SET status = 'removed', removed_at = ? WHERE name = ?`)
    .bind(nowSeconds, trialName)
    .run()
}

// Reverses retireTrial exactly: restores status/removed_at to what they
// were before the trial was retired, as if it never happened.
export async function unretireTrial(db: D1Database, trialName: string) {
  const existing = await getTrialLifecycle(db, trialName)
  if (!existing) {
    throw new TrialLifecycleError(`Trial "${trialName}" was not found.`, "not_found")
  }
  if (existing.status !== "removed") {
    throw new TrialLifecycleError(`Trial "${trialName}" is not retired.`, "not_removed")
  }

  await db.prepare(`UPDATE trials SET status = 'active', removed_at = NULL WHERE name = ?`)
    .bind(trialName)
    .run()
}

export async function bumpTrialVersion(db: D1Database, trialName: string, nowSeconds: number) {
  const existing = await getTrialLifecycle(db, trialName)
  if (!existing) {
    throw new TrialLifecycleError(`Trial "${trialName}" was not found.`, "not_found")
  }
  if (existing.status !== "active") {
    throw new TrialLifecycleError(`Trial "${trialName}" is not active.`, "not_active")
  }

  await db.prepare(`UPDATE trials SET version = version + 1, version_changed_at = ? WHERE name = ?`)
    .bind(nowSeconds, trialName)
    .run()
}

// Reverses bumpTrialVersion exactly: decrements the version, restores
// version_changed_at to when the *previous* bump happened (or null if this
// was the only one), and re-stamps any submissions recorded under the
// bumped-away version back down to the restored version, so they're valid
// current-version times again rather than being orphaned above the trial's
// current version.
export async function unbumpTrialVersion(db: D1Database, trialName: string) {
  const existing = await getTrialLifecycle(db, trialName)
  if (!existing) {
    throw new TrialLifecycleError(`Trial "${trialName}" was not found.`, "not_found")
  }
  if (existing.status !== "active") {
    throw new TrialLifecycleError(`Trial "${trialName}" is not active.`, "not_active")
  }
  if (existing.version <= 1) {
    throw new TrialLifecycleError(`Trial "${trialName}" hasn't been marked changed.`, "not_bumped")
  }

  const newVersion = existing.version - 1

  const previousBump = await db.prepare(
    `SELECT created_at FROM audit_logs
     WHERE action = 'trial_version_bumped' AND entity_type = 'trial' AND entity_uuid = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1 OFFSET 1`
  )
    .bind(trialName)
    .first<{ created_at: number }>()

  const newVersionChangedAt = previousBump?.created_at ?? null

  await db.batch([
    db.prepare(`UPDATE trials SET version = ?, version_changed_at = ? WHERE name = ?`)
      .bind(newVersion, newVersionChangedAt, trialName),
    db.prepare(`UPDATE submissions SET trial_version = ? WHERE trial_name = ? AND trial_version = ?`)
      .bind(newVersion, trialName, existing.version),
  ])
}

// Bulk-assigns sort_order to match the given order (index = new sort_order).
// Unknown names are silently ignored by the UPDATE's WHERE clause rather
// than throwing, since this is only ever called with the admin's own
// current (active-only) trial list — retired trials are excluded from
// reordering, so their sort_order is left untouched.
export async function reorderTrials(db: D1Database, orderedNames: string[]) {
  const statements = orderedNames.map((name, index) =>
    db.prepare(`UPDATE trials SET sort_order = ? WHERE name = ?`).bind(index, name)
  )

  if (statements.length) {
    await db.batch(statements)
  }
}
