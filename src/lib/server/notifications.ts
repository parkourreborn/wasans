import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare" 
import { ensurePlayerAvatarColumns } from "@/lib/server/player-avatar-schema"

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
  date: string
}

const roleRanks = {
  0.0: "1257994886070800465", // unranked
  0.3: "1501720864872206568",
  0.4: "1501720851748229294",
  0.5: "1373849841494523984",
  0.6: "1373849485003980820",
  0.7: "1305891664413593651",
  0.8: "1493644824237052075",
  0.9: "1257994883059290245"
}

const sortedRankRoles = Object.entries(roleRanks)
  .map(([score, roleId]) => ({ score: Number(score), roleId }))
  .sort((a, b) => a.score - b.score)

const roleNames: Record<string, string> = {
  "1257994886070800465": "unranked",
  "1501720864872206568": "platinum",
  "1501720851748229294": "diamond",
  "1373849841494523984": "master III",
  "1373849485003980820": "master II",
  "1305891664413593651": "master I",
  "1493644824237052075": "elite",
  "1257994883059290245": "router",
}

function getRoleForScore(score: number) {
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

function getRoleIndex(roleId: string) {
  return sortedRankRoles.findIndex((rank) => rank.roleId === roleId)
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
const BOT_API_BASE = "https://bot.wasans.tully.sh"
const WR_PING = "<@&1335389577883418736>"

async function getBotApiKey(): Promise<string> {
  let botApiKey = ""

  try {
    const { env } = await getCloudflareContext({ async: true })
    botApiKey = String(
      (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).botApiKey
      || (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).BOT_API_KEY
      || ""
    ).trim()
  } catch {
    // Fall back to process.env for local/runtime environments without Cloudflare context.
  }

  if (!botApiKey) {
    botApiKey = String(process.env.botApiKey || process.env.BOT_API_KEY || "").trim()
  }

  if (!botApiKey) {
    throw new Error("botApiKey/BOT_API_KEY is not configured")
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
  const apiKey = await getBotApiKey()
  const response = await fetch(`${BOT_API_BASE}${endpoint}`, {
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
    if (!Number.isFinite(submission.player_score)) {
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


export async function updateDiscordUsernameOnScoreChange(playerUuid: string, oldScore = 0) {
  try {
    const { env } = await getCloudflareContext({ async: true })
    await ensurePlayerAvatarColumns(env.wasans)
    const row = await env.wasans.prepare(
      `SELECT player_id, score, player_name, account_status FROM players WHERE uuid = ?`)
      .bind(playerUuid)
      .first<{ player_id: string, score: number, player_name: string, account_status?: string | null }>()

    if (!row || (row.account_status || "active") !== "active") {
      return
    }

    const playerId = row.player_id
    const score = row.score
    const playerName = row.player_name
    const oldRoleId = getRoleForScore(oldScore)
    const newRoleId = getRoleForScore(score)

    const memberSyncBody = {
      discord_user_id: playerId,
      scope: "ranking",
      score,
      nickname: `${playerName} (${score.toFixed(3)})`,
      options: {
        update_nickname: true,
        remove_unlisted_in_scope: true,
      },
    }

    const roleChanged = Boolean(oldRoleId && newRoleId && oldRoleId !== newRoleId)

    try {
      if (roleChanged && oldRoleId && newRoleId) {
        const oldIndex = getRoleIndex(oldRoleId)
        const newIndex = getRoleIndex(newRoleId)
        const isPromotion = newIndex > oldIndex
        const action = isPromotion ? "promoted" : "demoted"
        const oldRoleName = roleNames[oldRoleId] ?? oldRoleId
        const newRoleName = roleNames[newRoleId] ?? newRoleId

        await sendBotApiRequest("/v3/batch", {
          requests: [
            {
              id: "member-sync",
              route: "/v3/members/sync",
              body: memberSyncBody,
            },
            {
              id: "promotion-dm",
              route: "/v3/messages/dm",
              body: {
                discord_user_id: playerId,
                content: `${isPromotion ? "🎉 ": "😭 "}You have been ${action} from ${oldRoleName} to ${newRoleName}!`,
                options: {
                  fail_if_cannot_dm: false,
                },
              },
            },
          ],
          options: {
            continue_on_error: true,
          },
        })
      } else {
        await sendBotApiRequest("/v3/members/sync", memberSyncBody)
      }
    } catch (error) {
      console.error("Failed to sync Discord member state on score change:", error)
    }
  } catch (error) {
    console.error("updateDiscordUsernameOnScoreChange failed:", error)
  }
}
