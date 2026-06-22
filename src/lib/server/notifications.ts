import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare" 

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
  averageScoreDelta?: number
  is_wr: boolean
  // optional previous WR info (when this run becomes a WR)
  previous_wr_submission_uuid?: string
  previous_wr_time?: number
  previous_wr_player_name?: string
  previous_wr_thread_id?: string
  // the new state (approved/denied/pending) when updating existing threads
  new_state?: string
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

async function manageDiscordRole(userId: string, roleId: string, action: "add" | "remove") {
  try {
    await sendBotApiRequest("/manage-role", {
      guild_id: GUILD_ID,
      user_id: userId,
      role_id: roleId,
      action,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (action === "remove" && message.includes("role not found")) {
      return
    }
    throw error
  }
}

export const DISCORD_AUTHENTICATED_ROLE_ID = "1371654123446992936"

export async function grantDiscordAuthenticatedRole(userId: string) {
  return manageDiscordRole(userId, DISCORD_AUTHENTICATED_ROLE_ID, "add")
}

export async function sendDiscordDm(userId: string, content: string) {
  return sendBotApiRequest("/send-dm", {
    user_id: userId,
    content,
  })
}

export function getRankLabel(score: number) {
  const roleId = getRoleForScore(score)
  return roleId ? roleNames[roleId] ?? roleId : null
}

function getRoleIndex(roleId: string) {
  return sortedRankRoles.findIndex((rank) => rank.roleId === roleId)
}

async function sendPromotionMessage(userId: string, oldRoleId: string, newRoleId: string) {
  const oldIndex = getRoleIndex(oldRoleId)
  const newIndex = getRoleIndex(newRoleId)
  const isPromotion = newIndex > oldIndex
  const action = isPromotion ? "promoted" : "demoted"
  const oldRoleName = roleNames[oldRoleId] ?? oldRoleId
  const newRoleName = roleNames[newRoleId] ?? newRoleId


  await sendBotApiRequest("/send-message", {
    guild_id: GUILD_ID,
    channel_id: "1258680561929814066",
    content: `${isPromotion ? "🎉 ": "😭 "}<@${userId}> has been ${action} from ${oldRoleName} to ${newRoleName}!`,
  })
}

// Discord bot API configuration
const GUILD_ID = "1257994787512913961"
const THREAD_CHANNEL_ID = "1351374148881874944"
const BOT_API_BASE = "https://bot.wasans.tully.sh"

async function getBotApiKey(): Promise<string> {
  const botApiKey = process.env.botApiKey
  if (!botApiKey) {
    throw new Error("botApiKey environment variable is not configured")
  }
  return botApiKey
}

type BotApiResponse = {
  error?: string
  thread_id?: string
  id?: string
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

async function createBotThread(
  channelId: string,
  title: string,
  content: string,
  tags: string[]
): Promise<string | null> {
  try {
    const json = await sendBotApiRequest("/create-thread", {
      channel_id: channelId,
      title,
      content,
      guild_id: GUILD_ID,
      tags,
    })

    return typeof json.thread_id === "string"
      ? json.thread_id
      : typeof json.id === "string"
      ? json.id
      : null
  } catch (error) {
    console.error("Failed to create bot thread:", error)
    return null
  }
}

async function updateBotThreadTags(
  threadId: string,
  tags: string[]
): Promise<boolean> {
  try {
    await sendBotApiRequest("/update-thread-tags", {
      thread_id: threadId,
      channel_id: THREAD_CHANNEL_ID,
      tags,
    })
    return true
  } catch (error) {
    console.error("Failed to update bot thread tags:", error)
    return false
  }
}

async function updateBotThreadContent(
  threadId: string,
  title: string | null,
  content: string
): Promise<boolean> {
  try {
    await sendBotApiRequest("/update-thread", {
      thread_id: threadId,
      channel_id: THREAD_CHANNEL_ID,
      title,
      content,
    })
    return true
  } catch (error) {
    console.error("Failed to update bot thread content:", error)
    return false
  }
}

export async function deleteBotThread(threadId: string): Promise<boolean> {
  try {
    await sendBotApiRequest("/delete-thread", {
      thread_id: threadId,
      channel_id: THREAD_CHANNEL_ID
    })
    return true
  } catch (error) {
    console.error("Failed to delete bot thread:", error)
    return false
  }
}

export async function postApprovedRun(run: ApprovedHighScoreRun) {
  try {
    const oldTimeFormatted = run.oldTime !== undefined ? run.oldTime.toFixed(3) : "N/A"
    const newTimeFormatted = run.time.toFixed(3)
    const oldScoreFormatted = run.oldPlayerScore !== undefined ? run.oldPlayerScore.toFixed(3) : "N/A"
    const newScoreFormatted = run.player_score.toFixed(3)
    const userMention = run.discordUserId ? `<@${run.discordUserId}>` : run.player_name

    const scoreDeltaLine =
      run.averageScoreDelta !== undefined
      ?
        `Average score decrease: ${run.averageScoreDelta.toFixed(3)}`
        : null
        
    const lines: Array<string | null> = []

    if (run.is_wr) {
      lines.push("<@&1335389577883418736>")
    }

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

    if (scoreDeltaLine) {
      lines.push(scoreDeltaLine)
    }

    lines.push(`https://wasans.tully.sh/submissions/${run.submission_uuid}`)

    const announcementMessage = lines.filter(Boolean).join("\n")

    const threadTitle = `${run.trial_name} ${newTimeFormatted} | ${run.player_name}`
    const threadContent = announcementMessage

    const tags = ["1351581039499284521"]
    if (run.is_wr) {
      tags.push("1351581114841436230")
    }

    const threadId = await createBotThread(THREAD_CHANNEL_ID, threadTitle, threadContent, tags)
    return { threadId }
  } catch (error) {
    console.error("Error queuing approved high score run:", error)
    return { threadId: null }
  }
}

export type PendingSubmissionPost = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  player_score: number
  discordUserId?: string
}

export async function postPendingRun(submission: PendingSubmissionPost): Promise<{ threadId: string | null }> {
  try {
    const timeFormatted = submission.time.toFixed(3)
    const userMention = submission.discordUserId ? `<@${submission.discordUserId}>` : submission.player_name

    const announcementMessage = [
      `**${submission.trial_name} ${timeFormatted} | ${userMention}**`,
      `https://wasans.tully.sh/submissions/${submission.submission_uuid}`,
    ]
      .filter(Boolean)
      .join("\n")

    const threadTitle = `${submission.trial_name} ${timeFormatted} | ${submission.player_name}`
    const threadContent = announcementMessage

    const tags = ["1351580041896656936"]

    const threadId = await createBotThread(THREAD_CHANNEL_ID, threadTitle, threadContent, tags)
    return { threadId }
  } catch (error) {
    console.error("Error posting pending run:", error)
    return { threadId: null }
  }
}

export async function updateSubmissionThreadTags(
  threadId: string,
  newState: string,
  isWr: boolean
): Promise<boolean> {
  const tags: string[] = []

  if (newState === "approved") {
    tags.push("1351581039499284521")
  } else if (newState === "denied") {
    tags.push("1351581072043020442")
  } else if (newState === "pending") {
    tags.push("1351580041896656936")
  }

  // Only add WR tag when the submission is approved
  if (isWr && newState === "approved") {
    tags.push("1351581114841436230")
  }

  return updateBotThreadTags(threadId, tags)
}

export async function updateSubmissionThreadContent(
  threadId: string,
  run: ApprovedHighScoreRun
): Promise<boolean> {
  try {
    const oldTimeFormatted = run.oldTime !== undefined ? run.oldTime.toFixed(3) : "N/A"
    const newTimeFormatted = run.time.toFixed(3)
    const oldScoreFormatted = run.oldPlayerScore !== undefined ? run.oldPlayerScore.toFixed(3) : "N/A"
    const newScoreFormatted = run.player_score.toFixed(3)
    const userMention = run.discordUserId ? `<@${run.discordUserId}>` : run.player_name

    const scoreDeltaLine =
      run.averageScoreDelta !== undefined
      ?
        `Average score decrease: ${run.averageScoreDelta.toFixed(3)}`
        : null

    const lines: Array<string | null> = []
    const state = run.new_state ?? "approved"

    if (state === "approved") {
      if (run.is_wr) {
        lines.push("<@1501043686828544121>")
      }

      lines.push(`**${run.trial_name} ${newTimeFormatted} | ${userMention}**`)
      lines.push(`${oldTimeFormatted} -> ${newTimeFormatted}`)
      lines.push(`*${oldScoreFormatted}* -> *${newScoreFormatted}*`)

      if (run.is_wr) {
        if (run.previous_wr_thread_id) {
          lines.push(`Previous WR: <#${run.previous_wr_thread_id}>`)
        } else if (run.previous_wr_time && run.previous_wr_player_name) {
          lines.push(`Previous WR: ${run.previous_wr_time.toFixed(3)} by ${run.previous_wr_player_name}`)
        }
      }

      if (scoreDeltaLine) {
        lines.push(scoreDeltaLine)
      }
    } else if (state === "pending" || state === "denied") {
      lines.push(`**${run.trial_name} ${newTimeFormatted} | ${userMention}**`)
      if (run.oldTime !== undefined) {
        lines.push(`${oldTimeFormatted} -> ${newTimeFormatted}`)
      }
    } else {
      lines.push(`**${run.trial_name} ${newTimeFormatted} | ${userMention}**`)
    }

    lines.push(`https://wasans.tully.sh/submissions/${run.submission_uuid}`)

    const announcementMessage = lines.filter(Boolean).join("\n")

    const threadTitle = state === "approved" ? `${run.trial_name} ${newTimeFormatted} | ${run.player_name}` : null

    const ok = await updateBotThreadContent(threadId, threadTitle, announcementMessage)
    return ok
  } catch (error) {
    console.error("Failed to update submission thread content:", error)
    return false
  }
}


export async function updateDiscordUsernameOnScoreChange(playerUuid: string, oldScore = 0) {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const row = await env.wasans.prepare(
      `SELECT player_id, score, player_name FROM players WHERE uuid = ?`)
      .bind(playerUuid)
      .first<{ player_id: string, score: number, player_name: string }>()

    if (!row) {
      return
    }

    const playerId = row.player_id
    const score = row.score
    const playerName = row.player_name
    const oldRoleId = getRoleForScore(oldScore)
    const newRoleId = getRoleForScore(score)

    if (newRoleId) {
      for (const rank of sortedRankRoles) {
        if (rank.roleId === newRoleId) {
          continue
        }

        try {
          await manageDiscordRole(playerId, rank.roleId, "remove")
        } catch (error) {
          console.error("Failed to remove old Discord rank role:", { playerId, roleId: rank.roleId, error })
        }
      }

      try {
        await manageDiscordRole(playerId, newRoleId, "add")
      } catch (error) {
        console.error("Failed to add Discord rank role:", { playerId, roleId: newRoleId, error })
      }
    }

    if (oldRoleId && newRoleId && oldRoleId !== newRoleId) {
      try {
        await sendPromotionMessage(playerId, oldRoleId, newRoleId)
      } catch (error) {
        console.error("Failed to announce role promotion:", error)
      }
    }

    try {
      await sendBotApiRequest("/set-nick", {
        guild_id: GUILD_ID,
        user_id: playerId,
        nick: `${playerName} (${score.toFixed(3)})`,
      })
    } catch (error) {
      console.error("Failed to update Discord username on score change:", error)
    }
  } catch (error) {
    console.error("updateDiscordUsernameOnScoreChange failed:", error)
  }
}
