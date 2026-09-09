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

// Shared server-to-server credential check for routes the Discord bot calls
// directly instead of via a player session (moderation actions in
// moderation-service.ts, and Discord-id lookups like
// admin/players/by-discord).
export function isBotApiRequest(request: Request, env: CloudflareEnv) {
  const providedKey = getBotApiKeyFromRequest(request)
  const expectedKey = String(
    (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).botApiKey
    || (env as CloudflareEnv & { botApiKey?: string; BOT_API_KEY?: string }).BOT_API_KEY
    || process.env.botApiKey
    || process.env.BOT_API_KEY
    || ""
  ).trim()

  return secretsMatch(providedKey || "", expectedKey)
}
