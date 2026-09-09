import "server-only"
import {
  createPrizeCandidate,
  listActiveComboWrPrizes,
  listActiveRankupPrizes,
  listActiveScoreReachedPrizes,
  listActiveTrialWrPrizes,
} from "@/lib/server/repositories/prize-repository"

// Every function here looks up matching active prizes and raises a
// prize_candidates row for the owner to confirm/reject (hybrid detection --
// see the prizes migration's header comment). None of these ever throw: a
// checker bug must never break the moderation/scoring action it's attached
// to, matching how other best-effort side effects (e.g. sendDiscordDm(...)
// .catch(...)) are handled elsewhere in this codebase.

export async function checkTrialWrPrizeCandidates(
  db: D1Database,
  event: { trialName: string; playerUuid: string; playerName: string; submissionUuid: string; time: number }
): Promise<void> {
  try {
    const prizes = await listActiveTrialWrPrizes(db, event.trialName)
    const nowSeconds = Math.floor(Date.now() / 1000)

    for (const prize of prizes) {
      await createPrizeCandidate(db, {
        prizeUuid: prize.uuid,
        playerUuid: event.playerUuid,
        playerName: event.playerName,
        eventDetails: { trial_name: event.trialName, submission_uuid: event.submissionUuid, time: event.time },
        nowSeconds,
      })
    }
  } catch (error) {
    console.error("Trial WR prize candidate check failed:", error)
  }
}

export async function checkComboWrPrizeCandidates(
  db: D1Database,
  event: { categorySlug: string; playerUuid: string; playerName: string; submissionUuid: string; comboCount: number }
): Promise<void> {
  try {
    const prizes = await listActiveComboWrPrizes(db, event.categorySlug)
    const nowSeconds = Math.floor(Date.now() / 1000)

    for (const prize of prizes) {
      await createPrizeCandidate(db, {
        prizeUuid: prize.uuid,
        playerUuid: event.playerUuid,
        playerName: event.playerName,
        eventDetails: { category_slug: event.categorySlug, submission_uuid: event.submissionUuid, combo_count: event.comboCount },
        nowSeconds,
      })
    }
  } catch (error) {
    console.error("Combo WR prize candidate check failed:", error)
  }
}

export async function checkScoreReachedPrizeCandidates(
  db: D1Database,
  event: { playerUuid: string; playerName: string; oldScore: number; newScore: number }
): Promise<void> {
  if (event.newScore <= event.oldScore) {
    return
  }

  try {
    const prizes = await listActiveScoreReachedPrizes(db)
    const nowSeconds = Math.floor(Date.now() / 1000)

    for (const prize of prizes) {
      if (prize.criteria_score_target == null) {
        continue
      }
      // Only fires the instant the target is crossed upward, not on every
      // score refresh afterward.
      if (event.oldScore < prize.criteria_score_target && event.newScore >= prize.criteria_score_target) {
        await createPrizeCandidate(db, {
          prizeUuid: prize.uuid,
          playerUuid: event.playerUuid,
          playerName: event.playerName,
          eventDetails: { old_score: event.oldScore, new_score: event.newScore, target: prize.criteria_score_target },
          nowSeconds,
        })
      }
    }
  } catch (error) {
    console.error("Score-reached prize candidate check failed:", error)
  }
}

export async function checkRankupPrizeCandidates(
  db: D1Database,
  event: { playerUuid: string; playerName: string; isPromotion: boolean; newRoleId: string | null }
): Promise<void> {
  if (!event.isPromotion) {
    return
  }

  try {
    const prizes = await listActiveRankupPrizes(db)
    const nowSeconds = Math.floor(Date.now() / 1000)

    for (const prize of prizes) {
      // null criteria_target_role_id means "any promotion"; otherwise the
      // new role must match the prize's configured target tier exactly.
      if (prize.criteria_target_role_id != null && prize.criteria_target_role_id !== event.newRoleId) {
        continue
      }

      await createPrizeCandidate(db, {
        prizeUuid: prize.uuid,
        playerUuid: event.playerUuid,
        playerName: event.playerName,
        eventDetails: { new_role_id: event.newRoleId },
        nowSeconds,
      })
    }
  } catch (error) {
    console.error("Rank-up prize candidate check failed:", error)
  }
}
