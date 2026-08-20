import "server-only"
import { trials as knownTrialNames } from "@/lib/trials"
import { TRIAL_GRACE_PERIOD_SECONDS, type TrialLifecycle } from "@/lib/server/trial-lifecycle"

export type TrialLifecycleRow = TrialLifecycle & { name: string }

export async function getTrialLifecycle(db: D1Database, trialName: string): Promise<TrialLifecycleRow | null> {
  return db.prepare(
    `SELECT name, status, added_at, version, version_changed_at, removed_at
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
    `SELECT name, status, added_at, version, version_changed_at, removed_at
     FROM trials
     ORDER BY name ASC`
  ).all<TrialLifecycleRow>()

  return results || []
}

export class TrialLifecycleError extends Error {
  code: "unknown_trial" | "already_exists" | "not_found" | "not_active"

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

  await db.prepare(
    `INSERT INTO trials (name, status, added_at, version) VALUES (?, 'active', ?, 1)`
  )
    .bind(trialName, nowSeconds)
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
