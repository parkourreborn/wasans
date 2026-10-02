import "server-only"
import {
  countGiveawayEntries,
  getGiveaway,
  listCurrentGiveawayWinners,
  setGiveawayDiscordMessage,
} from "@/lib/server/repositories/giveaway-repository"
import { syncGiveawayToDiscord } from "@/lib/server/notifications"

// Discord ids come from the same Discord-login link as
// admin/players/by-discord (oauth_accounts), just looked up in the other
// direction (player uuid -> discord id) and batched for however many winners
// a round has. A player can in principle have relinked to a different
// Discord account over time, so the most recently updated row per player
// wins, same tie-break as admin/players/by-discord.
async function getDiscordIdsForPlayers(db: D1Database, playerUuids: string[]): Promise<Map<string, string>> {
  if (playerUuids.length === 0) return new Map()

  const placeholders = playerUuids.map(() => "?").join(",")
  const { results } = await db.prepare(
    `SELECT player_uuid, provider_account_id
     FROM oauth_accounts
     WHERE provider = 'discord' AND player_uuid IN (${placeholders})
     ORDER BY updated_at DESC`
  )
    .bind(...playerUuids)
    .all<{ player_uuid: string; provider_account_id: string }>()

  const discordIdByPlayerUuid = new Map<string, string>()
  for (const row of results || []) {
    if (!discordIdByPlayerUuid.has(row.player_uuid)) {
      discordIdByPlayerUuid.set(row.player_uuid, row.provider_account_id)
    }
  }

  return discordIdByPlayerUuid
}

// Fire-and-forget after any giveaway mutation (create/join/close/draw/reroll/
// extend/claim -- see ctx.waitUntil call sites in the giveaway routes). Keeps
// the bot's one live-edited Discord embed per giveaway in sync with whatever
// /prizes shows, and persists the channel/message id the bot reports back so
// the next call edits the same message instead of posting a duplicate.
//
// announceWinners is true only right after drawGiveawayWinners/
// rerollGiveawayWinners -- it tells the bot to also reply to the embed
// announcing the winners, rather than just updating it silently.
export async function notifyGiveawayChanged(db: D1Database, uuid: string, announceWinners = false): Promise<void> {
  try {
    const giveaway = await getGiveaway(db, uuid)
    if (!giveaway) return

    const entryCount = await countGiveawayEntries(db, uuid)
    const winners = giveaway.status === "active" ? [] : await listCurrentGiveawayWinners(db, uuid)
    const discordIdByPlayerUuid = await getDiscordIdsForPlayers(db, winners.map((winner) => winner.player_uuid))

    const result = await syncGiveawayToDiscord({
      uuid: giveaway.uuid,
      title: giveaway.title,
      description: giveaway.description,
      max_winners: giveaway.max_winners,
      ends_at: giveaway.ends_at,
      status: giveaway.status,
      entry_count: entryCount,
      winners: winners.map((winner) => ({
        player_name: winner.player_name,
        discord_user_id: discordIdByPlayerUuid.get(winner.player_uuid) ?? null,
        claimed: Boolean(winner.claimed),
      })),
      discord_channel_id: giveaway.discord_channel_id,
      discord_message_id: giveaway.discord_message_id,
      announce_winners: announceWinners,
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
