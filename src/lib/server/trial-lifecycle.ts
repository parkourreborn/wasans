// Pure decision logic for trial add/remove/change grace periods. No DB, no
// "server-only" — kept testable like moderation-normalization.ts/ux-rules.ts.
//
// Rules (all with a 7-day grace period from the triggering event):
//  - Added trial: does not count toward a player's score average until 7
//    days after it was added.
//  - Removed trial: keeps counting exactly as before for 7 days after
//    removal, then drops out of the average entirely.
//  - Changed trial (version bump): submissions made under the old version
//    keep counting for 7 days after the change, then only submissions made
//    under the current version count.
//
// Submissions themselves are never deleted by any of this — only whether
// they (and the trial) participate in WR/PB/score computation.

export const TRIAL_GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60

export type TrialLifecycle = {
  status: "active" | "removed"
  added_at: number
  version: number
  version_changed_at: number | null
  removed_at: number | null
}

// Whether the trial currently participates in WR/PB/score computation at all.
export function isTrialCountedNow(trial: TrialLifecycle, nowSeconds: number): boolean {
  if (trial.status === "removed") {
    return trial.removed_at != null && nowSeconds < trial.removed_at + TRIAL_GRACE_PERIOD_SECONDS
  }

  return nowSeconds >= trial.added_at + TRIAL_GRACE_PERIOD_SECONDS
}

// Whether a submission stamped with `submissionTrialVersion` still validly
// represents a time for this trial: either it matches the trial's current
// version, or the version changed recently enough that we're still inside
// the grace window covering the older version.
export function isSubmissionVersionValid(
  trial: Pick<TrialLifecycle, "version" | "version_changed_at">,
  submissionTrialVersion: number,
  nowSeconds: number
): boolean {
  if (submissionTrialVersion === trial.version) {
    return true
  }

  return trial.version_changed_at != null && nowSeconds < trial.version_changed_at + TRIAL_GRACE_PERIOD_SECONDS
}

// Whether a submission currently counts toward WR/PB/score computation:
// both the trial itself must be "counted" and the submission's own version
// must still be valid.
export function isSubmissionValidNow(
  trial: TrialLifecycle,
  submissionTrialVersion: number,
  nowSeconds: number
): boolean {
  return isTrialCountedNow(trial, nowSeconds) && isSubmissionVersionValid(trial, submissionTrialVersion, nowSeconds)
}

// Whether the trial currently accepts newly created submissions.
export function canAcceptNewSubmissions(trial: Pick<TrialLifecycle, "status">): boolean {
  return trial.status === "active"
}

// SQL fragment shared by wrs.ts/pbs.ts/player-scores.ts to filter a
// `submissions AS s JOIN trials AS t ON t.name = s.trial_name` query down to
// only currently-valid rows. Two `?` placeholders for `nowSeconds`, bound in
// the order they appear (status check, then version check).
export const VALID_SUBMISSION_SQL = `(
  (
    (t.status = 'active' AND ? >= t.added_at + ${TRIAL_GRACE_PERIOD_SECONDS})
    OR (t.status = 'removed' AND t.removed_at IS NOT NULL AND ? < t.removed_at + ${TRIAL_GRACE_PERIOD_SECONDS})
  )
  AND (
    s.trial_version = t.version
    OR (t.version_changed_at IS NOT NULL AND ? < t.version_changed_at + ${TRIAL_GRACE_PERIOD_SECONDS})
  )
)`

// Same as VALID_SUBMISSION_SQL but for queries that alias the trials table
// join differently (candidate/better self-joins in wrs.ts).
export function validSubmissionSql(submissionsAlias: string, trialsAlias: string) {
  return `(
    (
      (${trialsAlias}.status = 'active' AND ? >= ${trialsAlias}.added_at + ${TRIAL_GRACE_PERIOD_SECONDS})
      OR (${trialsAlias}.status = 'removed' AND ${trialsAlias}.removed_at IS NOT NULL AND ? < ${trialsAlias}.removed_at + ${TRIAL_GRACE_PERIOD_SECONDS})
    )
    AND (
      ${submissionsAlias}.trial_version = ${trialsAlias}.version
      OR (${trialsAlias}.version_changed_at IS NOT NULL AND ? < ${trialsAlias}.version_changed_at + ${TRIAL_GRACE_PERIOD_SECONDS})
    )
  )`
}
