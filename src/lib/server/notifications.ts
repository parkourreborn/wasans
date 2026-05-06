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

    const announcementMessage = [
      run.is_wr ? "<@&1335389577883418736>" : null,
      `**${run.trial_name} ${newTimeFormatted} | ${userMention}**`,
      `${oldTimeFormatted} -> ${newTimeFormatted}`,
      `*${oldScoreFormatted}* -> *${newScoreFormatted}*`,
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

  try {
    await sendBotApiRequest("/set-nick", {
      guild_id: GUILD_ID,
      user_id: playerId,
      nick: `${playerName} (${score.toFixed(3)})`,
    })
  } catch (error) {
    console.error("Failed to update Discord username on score change:", error)
  }
  // // TODO: update the Discord username cache when a player's score changes.
  // console.debug("updateDiscordUsernameOnScoreChange", { playerUuid, playerId, score })
}
