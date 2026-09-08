import "server-only"
import type { AuthUser } from "@/lib/server/auth"
import { canModerateCombo } from "@/lib/server/auth"
import { insertAuditLog } from "@/lib/server/audit"
import type { AuditAction } from "@/lib/server/audit"
import {
  deleteComboSubmissionCascade,
  getComboSubmissionBase,
  getComboSubmissionDeleteContext,
  getComboSubmissionWithPlayer,
  refreshComboPb,
  updateComboSubmissionByUuid,
} from "@/lib/server/repositories/combo-submission-repository"
import {
  normalizeModeratorNote,
  normalizeState,
} from "@/lib/server/moderation-normalization"

// Mirrors patchSubmission/deleteSubmission in moderation-service.ts, stripped
// of every bit of score/WR/Discord-thread machinery — combo submissions
// never touch players.score, pbs, or wrs, and there's no Discord bot for
// combos yet.
export async function patchComboSubmission(
  context: { env: CloudflareEnv; ctx: ExecutionContext; uuid: string; user: AuthUser },
  payload: {
    state?: unknown
    moderator_note?: unknown
  } | null
) {
  const { env, uuid, user } = context

  // Never rely on the route having gated this: this is the single function
  // every combo moderation action funnels through.
  if (!canModerateCombo(user)) {
    throw new Error("Moderator permission is required")
  }

  const state = normalizeState(payload?.state)
  const moderatorNote = normalizeModeratorNote(payload?.moderator_note)

  if (!state && moderatorNote === null) {
    throw new Error("State or moderator note must be provided")
  }

  const submission = await getComboSubmissionBase(env.wasans, uuid)
  if (!submission) {
    throw new Error("Combo submission was not found")
  }

  const previousState = normalizeState(submission.state) || submission.state
  const updates: Array<{ field: "state" | "moderator_note" | "moderator_username"; value: string | null }> = []

  if (state) {
    updates.push({ field: "state", value: state })
  }

  if (moderatorNote !== null) {
    updates.push({ field: "moderator_note", value: moderatorNote })
  }

  if (updates.length > 0) {
    updates.push({ field: "moderator_username", value: user.player_name })
  }

  await updateComboSubmissionByUuid(env.wasans, uuid, updates)

  const auditDetails: Record<string, unknown> = { category_slug: submission.category_slug }
  let auditAction: AuditAction = "combo_submission_updated"

  const stateChanged = Boolean(state && state !== previousState)

  if (stateChanged) {
    auditDetails.old_state = previousState
    auditDetails.new_state = state
    if (state === "approved") {
      auditAction = "combo_submission_approved"
    } else if (state === "denied") {
      auditAction = "combo_submission_denied"
    }
  }

  if (moderatorNote !== null) {
    auditDetails.moderator_note = moderatorNote
  }

  await insertAuditLog(env.wasans, auditAction, "combo_submission", uuid, {
    actor: user,
    details: auditDetails,
  })

  // combo_pbs only ever needs a single-row recompute (no site-wide fan-out
  // like trial WR changes), so this runs synchronously rather than via
  // ctx.waitUntil. Only a state change where the old or new state is
  // 'approved' can possibly move the PB.
  if (stateChanged && (previousState === "approved" || state === "approved")) {
    await refreshComboPb(env.wasans, submission.player_uuid, submission.category_slug)
  }

  return getComboSubmissionWithPlayer(env.wasans, uuid)
}

export async function deleteComboSubmission(
  env: CloudflareEnv,
  ctx: ExecutionContext,
  uuid: string,
  user: AuthUser
) {
  const submission = await getComboSubmissionDeleteContext(env.wasans, uuid)
  if (!submission) {
    throw new Error("Combo submission was not found")
  }

  if (submission.player_uuid !== user.uuid && !canModerateCombo(user)) {
    throw new Error("You can only delete your own combo submissions")
  }

  await insertAuditLog(env.wasans, "combo_submission_deleted", "combo_submission", uuid, {
    actor: user,
    details: {
      category_slug: submission.category_slug,
    },
  })

  await deleteComboSubmissionCascade(env.wasans, uuid)

  // The deleted row's combo_pbs entry (if any) is already gone via
  // ON DELETE CASCADE, but the next-best approved submission (if any) still
  // needs to take over the PB slot -- only relevant if the deleted row was
  // itself approved.
  if (submission.state === "approved") {
    await refreshComboPb(env.wasans, submission.player_uuid, submission.category_slug)
  }
}
