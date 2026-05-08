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
}

export type WorldRecordRun = {
  submission_uuid: string
  player_uuid: string
  player_name: string
  trial_name: string
  time: number
  date: string
}


const wasansMemberRoleId = "1315480739311124593";

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


    sendBotApiRequest("/manage-role", {
      guild_id: GUILD_ID,
      user_id: run.discordUserId,
      role_id: wasansMemberRoleId,
      action: "add",
    }).catch((error) => {});

    const scoreDeltaLine =
      run.averageScoreDelta !== undefined
      ?
        `Average score decrease: ${run.averageScoreDelta.toFixed(3)}`
        : null

    const announcementMessage = [
      run.is_wr ? "<@&1335389577883418736>" : null,
      `**${run.trial_name} ${newTimeFormatted} | ${userMention}**`,
      `${oldTimeFormatted} -> ${newTimeFormatted}`,
      `*${oldScoreFormatted}* -> *${newScoreFormatted}*`,
      scoreDeltaLine,
      `https://wasans.tully.sh/submissions/${run.submission_uuid}`,
    ]
      .filter(Boolean)
      .join("\n")

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


export async function updateDiscordUsernameOnScoreChange(playerUuid: string, oldScore = 0) {
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

  try {
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
  } catch (error) {
    console.error("Failed to update Discord rank roles on score change:", error)
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
}
