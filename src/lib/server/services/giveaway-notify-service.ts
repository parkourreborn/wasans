import "server-only"
import {
  countGiveawayEntries,
  getGiveaway,
  listCurrentGiveawayWinners,
  setGiveawayDiscordMessage,
} from "@/lib/server/repositories/giveaway-repository"
import { syncGiveawayToDiscord } from "@/lib/server/notifications"

// Fire-and-forget after any giveaway mutation (create/join/close/draw/reroll/
// extend/claim -- see ctx.waitUntil call sites in the giveaway routes). Keeps
// the bot's one live-edited Discord embed per giveaway in sync with whatever
// /prizes shows, and persists the channel/message id the bot reports back so
// the next call edits the same message instead of posting a duplicate.
export async function notifyGiveawayChanged(db: D1Database, uuid: string): Promise<void> {
  try {
    const giveaway = await getGiveaway(db, uuid)
    if (!giveaway) return

    const entryCount = await countGiveawayEntries(db, uuid)
    const winners = giveaway.status === "active" ? [] : await listCurrentGiveawayWinners(db, uuid)

    const result = await syncGiveawayToDiscord({
      uuid: giveaway.uuid,
      title: giveaway.title,
      description: giveaway.description,
      max_winners: giveaway.max_winners,
      ends_at: giveaway.ends_at,
      status: giveaway.status,
      entry_count: entryCount,
      winners: winners.map((winner) => ({ player_name: winner.player_name, claimed: Boolean(winner.claimed) })),
      discord_channel_id: giveaway.discord_channel_id,
      discord_message_id: giveaway.discord_message_id,
    })

    if (
      result.channelId &&
      result.messageId &&
      (result.channelId !== giveaway.discord_channel_id || result.messageId !== giveaway.discord_message_id)
    ) {
      await setGiveawayDiscordMessage(db, uuid, result.channelId, result.messageId)
    }
  } catch (error) {
    console.error("notifyGiveawayChanged failed:", error)
  }
}
