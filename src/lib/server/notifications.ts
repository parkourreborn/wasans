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

// Discord bot API configuration
const GUILD_ID = "1257994787512913961"
const ANNOUNCEMENT_CHANNEL_ID = "1258680561929814066"
const THREAD_CHANNEL_ID = "1351374148881874944"
const BOT_API_BASE = "https://bot.wasans.tully.sh"

type BotApiError = {
  error: string
}

async function getBotApiKey(): Promise<string> {
  
  const botApiKey = process.env.botApiKey
  if (!botApiKey) {
    throw new Error("botApiKey environment variable is not configured")
  }
  return botApiKey
}

async function sendBotApiRequest(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Response> {
  const apiKey = await getBotApiKey()
  const response = await fetch(`${BOT_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  return response
}

async function sendBotMessage(content: string, channelId: string): Promise<boolean> {
  try {
    const response = await sendBotApiRequest("/send-message", {
      channel_id: channelId,
      content,
      guild_id: GUILD_ID,
    })
    return response.ok
  } catch (error) {
    console.error("Failed to send bot message:", error)
    return false
  }
}

async function createBotThread(
  channelId: string,
  title: string,
  content: string
): Promise<boolean> {
  try {
    const response = await sendBotApiRequest("/create-thread", {
      channel_id: channelId,
      title,
      content,
      guild_id: GUILD_ID,
    })
    return response.ok
  } catch (error) {
    console.error("Failed to create bot thread:", error)
    return false
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs.toFixed(3)).padStart(6, "0")}`
  }
  return `${minutes}:${String(secs.toFixed(3)).padStart(6, "0")}`
}

export async function postApprovedRun(run: ApprovedHighScoreRun) {

  try {
    const oldTimeFormatted = run.oldTime !== undefined ? run.oldTime : "N/A"
    const newTimeFormatted = run.time
    const oldScoreFormatted = run.oldPlayerScore !== undefined ? run.oldPlayerScore.toFixed(3) : "N/A"
    const newScoreFormatted = run.player_score.toFixed(3)
    const userMention = run.discordUserId ? `<@${run.discordUserId}>` : run.player_name

    // Send announcement message

    const announcementMessage = (run.is_wr ? "<@&1335389577883418736>\n" : "") +`
**${run.trial_name} ${newTimeFormatted} | ${userMention}**

${run.trial_name} ${oldTimeFormatted} -> ${newTimeFormatted}
*${oldScoreFormatted}* -> *${newScoreFormatted}*

https://wasans.tully.sh/submissions/${run.submission_uuid}
`.trim()

    await sendBotMessage(announcementMessage, ANNOUNCEMENT_CHANNEL_ID)

    // // Create thread
    const threadTitle = `${run.trial_name} ${newTimeFormatted} | ${run.player_name}`
    const threadContent = `https://wasans.tully.sh/submissions/${run.submission_uuid}`

    await createBotThread(THREAD_CHANNEL_ID, threadTitle, threadContent)
  } catch (error) {
    console.error("Error queuing approved high score run:", error)
  }
}


export async function updateDiscordUsernameOnScoreChange(playerUuid: string) {
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

  sendBotApiRequest("/set-nick",{
    guild_id: GUILD_ID,
    user_id: playerId,
    nick: `${playerName} (${score.toFixed(3)})`
  })
  // // TODO: update the Discord username cache when a player's score changes.
  // console.debug("updateDiscordUsernameOnScoreChange", { playerUuid, playerId, score })
}
