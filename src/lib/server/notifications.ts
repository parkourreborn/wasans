import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { TIERS, type TierKey } from "@/lib/tiers"

export type ApprovedHighScoreRun = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  player_score: number
  oldTime?: number
  oldPlayerScore?: number
  discordUserId?: string,
  discord_avatar?: string | null
  discord_discriminator?: string | null
  averageScoreChange?: number
  is_wr: boolean
  // optional previous WR info (when this run becomes a WR)
  previous_wr_submission_uuid?: string
  previous_wr_time?: number
  previous_wr_player_name?: string
  previous_wr_thread_id?: string
  // the new state (approved/denied/pending) when updating existing threads
  new_state?: string
  moderator_note?: string | null
}

export type WorldRecordRun = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  date: number
}

// The Discord role for each score tier. The thresholds and names come from
// lib/tiers.ts, which the site uses to label players, so the bot and the
// site can't disagree about who is in which tier.
const roleIdByTier: Record<TierKey, string> = {
  unranked: "1257994886070800465",
  platinum: "1501720864872206568",
  diamond: "1501720851748229294",
  master3: "1373849841494523984",
  master2: "1373849485003980820",
  master1: "1305891664413593651",
  elite: "1493644824237052075",
  router: "1257994883059290245",
}

const sortedRankRoles = [...TIERS]
  .sort((a, b) => a.min - b.min)
  .map((tier) => ({ score: tier.min, roleId: roleIdByTier[tier.key] }))

const roleNames: Record<string, string> = Object.fromEntries(
  TIERS.map((tier) => [roleIdByTier[tier.key], tier.roleName])
)

export function getRoleForScore(score: number) {
  if (!Number.isFinite(score)) {
    return null
  }

  let matchedRole: string | null = null

  for (const rank of sortedRankRoles) {
    if (score >= rank.score) {
      matchedRole = rank.roleId
    } else {
      break
    }
  }

  return matchedRole
}


export async function sendDiscordDm(userId: string, content: string) {
  return sendBotApiRequest("/v3/messages/dm", {
    discord_user_id: userId,
    content,
    options: {
      fail_if_cannot_dm: false,
    },
  })
}

export function getRankLabel(score: number) {
  const roleId = getRoleForScore(score)
  return roleId ? roleNames[roleId] ?? roleId : null
}

export function getRoleIndex(roleId: string) {
  return sortedRankRoles.findIndex((rank) => rank.roleId === roleId)
}

// Used by the private player-analytics view to show "X score away from
// [next rank]" -- reads the same thresholds getRoleForScore uses rather than
// duplicating them, so the two can never drift apart.
export function getNextRoleProgress(score: number) {
  if (!Number.isFinite(score)) {
    return null
  }

  const next = sortedRankRoles.find((rank) => rank.score > score)
  if (!next) {
    return null
  }

  return {
    nextRoleName: roleNames[next.roleId] ?? next.roleId,
    scoreNeeded: Number((next.score - score).toFixed(3)),
  }
}

type SubmissionSyncPayload = {
  submission_id: string
  state: "pending" | "approved" | "denied"
  trial_name: string
  player_name: string
  player_discord_id?: string
  discord_avatar?: string | null
  discord_avatar_discriminator?: string | null
  time_new: number
  time_old?: number
  score_new?: number
  score_old?: number
  average_score_change?: number
  is_wr: boolean
  previous_wr?: {
    player_name?: string
    time?: number
    thread_id?: string
  }
  moderator_note?: string
  thread_id?: string
  options?: {
    send_wr_ping?: boolean
    create_if_missing?: boolean
  }
}

type SubmissionSyncResponse = {
  ok?: boolean
  thread?: {
    id?: string
    created?: boolean
    updated?: boolean
  }
  tags_applied?: string[]
  wr_ping_sent?: boolean
}

async function syncSubmissionThread(payload: SubmissionSyncPayload): Promise<SubmissionSyncResponse> {
  return sendBotApiRequest("/v3/submissions/sync", payload) as Promise<SubmissionSyncResponse>
}

// Discord bot API configuration
const GUILD_ID = "1257994787512913961"
const THREAD_CHANNEL_ID = "1351374148881874944"
const WR_PING = "<@&1335389577883418736>"

// The bot runs on a Raspberry Pi with no public address. The BOT_SERVICE
// binding is a Workers VPC Service that reaches it through the Pi's
// Cloudflare Tunnel (see wrangler.jsonc). With a VPC Service the binding's
// own host and port decide where the request goes, so this URL's host only
// fills in the Host header.
const BOT_SERVICE_URL = "http://bot"

type BotEnv = CloudflareEnv & {
  BOT_SERVICE?: Fetcher
  SITE_TO_BOT_KEY?: string
  botApiKey?: string
  BOT_API_KEY?: string
}

async function getBotEnv(): Promise<BotEnv | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env as BotEnv
  } catch {
    // Local/runtime environments without a Cloudflare context.
    return null
  }
}

// SITE_TO_BOT_KEY is the key the site presents to the bot. The bot presents
// a different one back (BOT_TO_SITE_KEY, see bot-auth.ts). The old shared
// botApiKey/BOT_API_KEY is still accepted until the split keys are set.
function getBotApiKey(env: BotEnv | null): string {
  const botApiKey = String(
    env?.SITE_TO_BOT_KEY
    || env?.botApiKey
    || env?.BOT_API_KEY
    || process.env.SITE_TO_BOT_KEY
    || process.env.botApiKey
    || process.env.BOT_API_KEY
    || ""
  ).trim()

  if (!botApiKey) {
    throw new Error("SITE_TO_BOT_KEY is not configured")
  }

  return botApiKey
}

type BotApiResponse = {
  ok?: boolean
  error?: string
  thread_id?: string
  id?: string
  message_id?: string | null
}

async function sendBotApiRequest(
  endpoint: string,
  body: Record<string, unknown>
): Promise<BotApiResponse> {
  const env = await getBotEnv()
  const apiKey = getBotApiKey(env)
  if (!env?.BOT_SERVICE) {
    throw new Error("BOT_SERVICE binding is not configured")
  }

  const response = await env.BOT_SERVICE.fetch(`${BOT_SERVICE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await response.text().catch(() => "")
  let json: BotApiResponse = {}

  try {
    json = JSON.parse(text || "{}") as BotApiResponse
  } catch {
    // ignore invalid JSON and preserve raw text
  }

  if (!response.ok) {
    const errorMessage = json.error || text || `Bot API request failed: ${endpoint}`
    throw new Error(`${errorMessage} (status: ${response.status})`)
  }

  return json
}


export async function deleteBotThread(threadId: string, submissionId = "unknown-submission"): Promise<boolean> {
  try {
    await sendBotApiRequest("/v3/submissions/delete", {
      submission_id: submissionId,
      thread_id: threadId,
      mode: "delete",
    })
    return true
  } catch (error) {
    console.error("Failed to delete bot thread:", error)
    return false
  }
}

export function reportMissingApprovedThread(run: ApprovedHighScoreRun) {
  const oldTimeFormatted = run.oldTime !== undefined ? run.oldTime.toFixed(3) : "N/A"
  const newTimeFormatted = run.time.toFixed(3)
  const oldScoreFormatted = run.oldPlayerScore !== undefined ? run.oldPlayerScore.toFixed(3) : "N/A"
  const newScoreFormatted = run.player_score.toFixed(3)
  const userMention = run.discordUserId ? `<@${run.discordUserId}>` : run.player_name

  const lines: Array<string | null> = []

  lines.push(`**${run.trial_name} ${newTimeFormatted} | ${userMention}**`)
  lines.push(`${oldTimeFormatted} -> ${newTimeFormatted}`)
  lines.push(`*${oldScoreFormatted}* -> *${newScoreFormatted}*`)

  if (run.previous_wr_time && run.previous_wr_player_name) {
    if (run.previous_wr_thread_id) {
      lines.push(`Previous WR: ${run.previous_wr_time.toFixed(3)} by ${run.previous_wr_player_name} <#${run.previous_wr_thread_id}>`)
    } else {
      lines.push(`Previous WR: ${run.previous_wr_time.toFixed(3)} by ${run.previous_wr_player_name}`)
    }
  }

  if (run.averageScoreChange !== undefined) {
    const sign = run.averageScoreChange >= 0 ? "+" : ""
    lines.push(`Average score change: ${sign}${run.averageScoreChange.toFixed(3)}`)
  }

  const submissionUrl = `https://wasans.tully.sh/submissions/${run.submission_uuid}`
  lines.push(submissionUrl)

  const title = `${run.trial_name} ${newTimeFormatted} | ${run.player_name}`
  const content = lines.filter(Boolean).join("\n")
  const tags = ["1351581039499284521"]
  if (run.is_wr) {
    tags.push("1351581114841436230")
  }

  console.error("Approved submission has no Discord thread; manual thread creation/update required", {
    channel_id: THREAD_CHANNEL_ID,
    guild_id: GUILD_ID,
    title,
    content,
    tags,
    submission: {
      uuid: run.submission_uuid,
      url: submissionUrl,
      player_uuid: run.player_uuid,
      player_name: run.player_name,
      discord_user_id: run.discordUserId,
      trial_name: run.trial_name,
      is_wr: run.is_wr,
      wr_ping: run.is_wr ? WR_PING : undefined,
    },
    time_change: {
      old_time: run.oldTime,
      old_time_formatted: oldTimeFormatted,
      new_time: run.time,
      new_time_formatted: newTimeFormatted,
    },
    score_change: {
      old_score: run.oldPlayerScore,
      old_score_formatted: oldScoreFormatted,
      new_score: run.player_score,
      new_score_formatted: newScoreFormatted,
      average_score_change: run.averageScoreChange,
    },
    previous_wr: {
      submission_uuid: run.previous_wr_submission_uuid,
      time: run.previous_wr_time,
      player_name: run.previous_wr_player_name,
      thread_id: run.previous_wr_thread_id,
    },
  })
}

export type PendingSubmissionPost = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  oldTime?: number
  player_score: number
  discordUserId?: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
}

export async function postPendingRun(submission: PendingSubmissionPost): Promise<{ threadId: string | null }> {
  try {
    if (!Number.isFinite(submission.player_score) || !submission.discordUserId) {
      return { threadId: null }
    }

    const response = await syncSubmissionThread({
      submission_id: submission.submission_uuid,
      state: "pending",
      trial_name: submission.trial_name,
      player_name: submission.player_name,
      player_discord_id: submission.discordUserId,
      discord_avatar: submission.discord_avatar,
      discord_avatar_discriminator: submission.discord_discriminator,
      time_new: submission.time,
      time_old: submission.oldTime,
      score_new: Number.isFinite(submission.player_score) ? submission.player_score : undefined,
      is_wr: false,
      options: {
        create_if_missing: true,
        send_wr_ping: false,
      },
    })
    const threadId = response.thread?.id || null
    return { threadId }
  } catch (error) {
    console.error("Error posting pending run:", error)
    return { threadId: null }
  }
}

export async function postApprovedRun(run: ApprovedHighScoreRun): Promise<{ threadId: string | null }> {
  try {
    if (!run.discordUserId) {
      return { threadId: null }
    }

    const response = await syncSubmissionThread({
      submission_id: run.submission_uuid,
      state: "approved",
      trial_name: run.trial_name,
      player_name: run.player_name,
      player_discord_id: run.discordUserId,
      discord_avatar: run.discord_avatar,
      discord_avatar_discriminator: run.discord_discriminator,
      time_new: run.time,
      time_old: run.oldTime,
      score_new: run.player_score,
      score_old: run.oldPlayerScore,
      average_score_change: run.averageScoreChange,
      is_wr: run.is_wr,
      previous_wr: {
        player_name: run.previous_wr_player_name,
        time: run.previous_wr_time,
        thread_id: run.previous_wr_thread_id,
      },
      options: {
        create_if_missing: true,
        send_wr_ping: run.is_wr,
      },
    })
    const threadId = response.thread?.id || null

    return { threadId }
  } catch (error) {
    console.error("Error posting approved run:", error)
    return { threadId: null }
  }
}

export async function updateSubmissionThreadContent(
  threadId: string,
  run: ApprovedHighScoreRun
): Promise<boolean> {
  try {
    const state = run.new_state === "pending" || run.new_state === "denied" || run.new_state === "approved"
      ? run.new_state
      : "approved"
    const response = await syncSubmissionThread({
      submission_id: run.submission_uuid,
      state,
      trial_name: run.trial_name,
      player_name: run.player_name,
      player_discord_id: run.discordUserId,
      discord_avatar: run.discord_avatar,
      discord_avatar_discriminator: run.discord_discriminator,
      time_new: run.time,
      time_old: run.oldTime,
      score_new: run.player_score,
      score_old: run.oldPlayerScore,
      average_score_change: run.averageScoreChange,
      is_wr: run.is_wr,
      previous_wr: {
        player_name: run.previous_wr_player_name,
        time: run.previous_wr_time,
        thread_id: run.previous_wr_thread_id,
      },
      moderator_note: run.moderator_note || undefined,
      thread_id: threadId,
      options: {
        create_if_missing: true,
        send_wr_ping: state === "approved" && run.is_wr,
      },
    })
    return Boolean(response.ok)
  } catch (error) {
    console.error("Failed to update submission thread content:", error)
    return false
  }
}


type BatchRequestItem = { id: string; route: string; body: Record<string, unknown> }

// Syncs Discord nickname/rank-role state for many players in as few HTTP
// calls to the bot as possible: one DB query for all their current rows,
// then their member-sync (+ optional promotion/demotion DM) requests are
// packed into /v3/batch calls instead of firing one HTTP request per player.
export async function syncDiscordMembersOnScoreChange(players: Array<{ playerUuid: string; oldScore: number }>) {
  const uniquePlayers = players.filter((entry) => entry.playerUuid)
  if (!uniquePlayers.length) {
    return
  }

  try {
    const { env } = await getCloudflareContext({ async: true })

    // D1 caps a query at 100 bound parameters, so a site-wide sync (the
    // recalculate-all button) looks players up in chunks.
    type MemberRow = { uuid: string; discord_id: string | null; score: number; player_name: string; account_status?: string | null }
    const LOOKUP_CHUNK_SIZE = 90
    const rowByUuid = new Map<string, MemberRow>()
    for (let i = 0; i < uniquePlayers.length; i += LOOKUP_CHUNK_SIZE) {
      const lookupUuids = uniquePlayers.slice(i, i + LOOKUP_CHUNK_SIZE).map((entry) => entry.playerUuid)
      const placeholders = lookupUuids.map(() => "?").join(",")
      const { results } = await env.wasans.prepare(
        `SELECT uuid, discord_id, score, player_name, account_status FROM players WHERE uuid IN (${placeholders})`
      )
        .bind(...lookupUuids)
        .all<MemberRow>()
      for (const row of results || []) {
        rowByUuid.set(row.uuid, row)
      }
    }
    const items: BatchRequestItem[] = []
    let counter = 0

    for (const { playerUuid, oldScore } of uniquePlayers) {
      const row = rowByUuid.get(playerUuid)
      // Players with no linked Discord have no Discord identity to sync a
      // nickname/role for or DM -- there is nothing meaningful to send the bot.
      if (!row || (row.account_status || "active") !== "active" || !row.discord_id) {
        continue
      }

      const playerId = row.discord_id
      const score = row.score
      const playerName = row.player_name
      const oldRoleId = getRoleForScore(oldScore)
      const newRoleId = getRoleForScore(score)
      const roleChanged = Boolean(oldRoleId && newRoleId && oldRoleId !== newRoleId)

      counter += 1
      items.push({
        id: `member-sync-${counter}`,
        route: "/v3/members/sync",
        body: {
          discord_user_id: playerId,
          scope: "ranking",
          score,
          nickname: `${playerName} (${score.toFixed(3)})`,
          options: {
            update_nickname: true,
            remove_unlisted_in_scope: true,
          },
        },
      })

      if (roleChanged && oldRoleId && newRoleId) {
        const isPromotion = getRoleIndex(newRoleId) > getRoleIndex(oldRoleId)
        const action = isPromotion ? "promoted" : "demoted"
        const oldRoleName = roleNames[oldRoleId] ?? oldRoleId
        const newRoleName = roleNames[newRoleId] ?? newRoleId

        items.push({
          id: `promotion-dm-${counter}`,
          route: "/v3/messages/dm",
          body: {
            discord_user_id: playerId,
            content: `${isPromotion ? "🎉 " : "😭 "}You have been ${action} from ${oldRoleName} to ${newRoleName}!`,
            options: {
              fail_if_cannot_dm: false,
            },
          },
        })
      }
    }

    if (!items.length) {
      return
    }

    // Keep each HTTP call to the bot a reasonable size instead of sending
    // one enormous request during a mass rescore (e.g. a WR change).
    const CHUNK_SIZE = 100
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE)
      await sendBotApiRequest("/v3/batch", {
        requests: chunk,
        options: { continue_on_error: true },
      }).catch((error) => {
        console.error("Failed to sync Discord member state batch:", error)
      })
    }
  } catch (error) {
    console.error("syncDiscordMembersOnScoreChange failed:", error)
  }
}

export async function updateDiscordUsernameOnScoreChange(playerUuid: string, oldScore = 0) {
  await syncDiscordMembersOnScoreChange([{ playerUuid, oldScore }])
}

export type GiveawaySyncPayload = {
  uuid: string
  title: string
  description: string | null
  max_winners: number
  ends_at: number
  status: "active" | "won" | "closed"
  entry_count: number
  winners: Array<{ player_name: string; discord_user_id: string | null; claimed: boolean }>
  discord_channel_id: string | null
  discord_message_id: string | null
  // True only when this sync follows a fresh draw or reroll -- tells the bot
  // to post a "Congratulations" reply to the embed announcing the winners,
  // rather than just updating the embed silently (every other mutation).
  announce_winners: boolean
}

type GiveawaySyncResponse = BotApiResponse & {
  channel_id?: string | null
  message_id?: string | null
}

// Pushes a giveaway's current public state to the bot so it can post (first
// time) or edit (every time after) the one live embed for it -- see
// notifyGiveawayChanged, which calls this after every giveaway mutation, and
// /v3/giveaways/sync in wasans-bot, which does the posting/editing.
export async function syncGiveawayToDiscord(
  payload: GiveawaySyncPayload
): Promise<{ channelId: string | null; messageId: string | null }> {
  try {
    const response = await sendBotApiRequest("/v3/giveaways/sync", payload) as GiveawaySyncResponse
    return { channelId: response.channel_id ?? null, messageId: response.message_id ?? null }
  } catch (error) {
    console.error("Failed to sync giveaway to Discord:", error)
    return { channelId: null, messageId: null }
  }
}
