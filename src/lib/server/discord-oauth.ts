import "server-only"

export const discordRedirectUri = "https://wasans.tully.sh/api/auth/discord/callback"

type DiscordOAuthEnv = {
  discordClientId?: string
  discordClientSecret?: string
}

export function getDiscordClientId(env: DiscordOAuthEnv) {
  if (!env.discordClientId) {
    throw new Error("discordClientId binding is not configured")
  }

  return env.discordClientId
}

export function getDiscordClientSecret(env: DiscordOAuthEnv) {
  if (!env.discordClientSecret) {
    throw new Error("discordClientSecret binding is not configured")
  }

  return env.discordClientSecret
}

export function getDiscordRedirectUri() {
  return discordRedirectUri
}
