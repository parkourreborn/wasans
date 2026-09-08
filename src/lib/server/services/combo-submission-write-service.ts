import "server-only"
import { insertAuditLog } from "@/lib/server/audit"
import { generateShortId } from "@/lib/utils"
import { isValidComboCategorySlug } from "@/lib/server/repositories/combo-category-repository"
import {
  createComboSubmission,
  findComboPlayerByUuid,
  getComboSubmissionBase,
} from "@/lib/server/repositories/combo-submission-repository"

export type IncomingComboSubmission = {
  category_slug?: unknown
  combo_count?: unknown
  youtube_url?: unknown
}

export const allowedComboLinkHosts = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"]

export function parseYoutubeLink(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null
  }

  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()

    if (url.protocol !== "https:" || !allowedComboLinkHosts.includes(host)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

export function isValidComboCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

// No "must beat your PB" gate here, unlike trial submissions — unlimited
// resubmission is explicit for combos, since combo counts are a rougher,
// more disputable measurement than a trial time.
export async function createComboSubmissionFromRequest(
  db: D1Database,
  env: CloudflareEnv,
  user: { uuid: string },
  body: IncomingComboSubmission | null
) {
  if (!body) {
    throw new Error("Combo submission data is missing")
  }

  const player = await findComboPlayerByUuid(db, user.uuid)
  if (!player) {
    throw new Error("Player was not found")
  }

  const categorySlug = typeof body.category_slug === "string" ? body.category_slug.trim().toLowerCase() : ""
  if (!categorySlug) {
    throw new Error("category_slug is required")
  }

  if (!(await isValidComboCategorySlug(db, categorySlug))) {
    throw new Error("Unknown or currently disabled combo category")
  }

  const rawComboCount = typeof body.combo_count === "number" ? body.combo_count : Number(body.combo_count)
  if (!isValidComboCount(rawComboCount)) {
    throw new Error("combo_count must be a positive whole number")
  }

  const youtubeUrl = parseYoutubeLink(body.youtube_url)
  if (!youtubeUrl) {
    throw new Error("youtube_url must be a valid, https YouTube link")
  }

  const uuid = generateShortId()
  const now = Math.floor(Date.now() / 1000)

  await createComboSubmission(db, {
    uuid,
    playerUuid: player.uuid,
    categorySlug,
    playerName: player.player_name,
    comboCount: rawComboCount,
    youtubeUrl,
    now,
  })

  await insertAuditLog(db, "combo_submission_created", "combo_submission", uuid, {
    actor: { uuid: player.uuid, player_name: player.player_name },
    details: {
      category_slug: categorySlug,
      combo_count: rawComboCount,
      youtube_url: youtubeUrl,
    },
  })

  // Extension point for a future Discord "pending combo" notification —
  // occupies the same position postPendingRun(...) does for trial
  // submissions in submission-write-service.ts. No Discord bot exists for
  // combos yet, so nothing is called here.

  return getComboSubmissionBase(db, uuid)
}
