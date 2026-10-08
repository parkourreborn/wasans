import "server-only"
import { secretsMatch } from "@/lib/constant-time"

function getBotApiKeyFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim()
  }

  return request.headers.get("x-api-key")?.trim()
    || request.headers.get("x-bot-api-key")?.trim()
    || null
}

type BotAuthEnv = CloudflareEnv & {
  BOT_TO_SITE_KEY?: string
  botApiKey?: string
  BOT_API_KEY?: string
}

// Server-to-server credential check for routes the Discord bot calls
// directly instead of via a player session (moderation actions in
// moderation-service.ts, and Discord-id lookups like
// admin/players/by-discord). BOT_TO_SITE_KEY is only ever presented by the
// bot; the site uses a different key to call the bot (SITE_TO_BOT_KEY, see
// notifications.ts). The old shared botApiKey/BOT_API_KEY is still accepted
// until the split keys are set.
export function isBotApiRequest(request: Request, env: CloudflareEnv) {
  const botEnv = env as BotAuthEnv
  const providedKey = getBotApiKeyFromRequest(request)
  const expectedKey = String(
    botEnv.BOT_TO_SITE_KEY
    || botEnv.botApiKey
    || botEnv.BOT_API_KEY
    || process.env.BOT_TO_SITE_KEY
    || process.env.botApiKey
    || process.env.BOT_API_KEY
    || ""
  ).trim()

  return secretsMatch(providedKey || "", expectedKey)
}
