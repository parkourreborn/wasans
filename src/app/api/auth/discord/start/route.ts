import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getDiscordClientId, getDiscordRedirectUri } from "@/lib/server/discord-oauth"

const discordAuthorizeUrl = "https://discord.com/oauth2/authorize"

function getSafeNextUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/submissions"
  }

  return value
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const requestUrl = new URL(request.url)
  const state = crypto.randomUUID()
  const nextUrl = getSafeNextUrl(requestUrl.searchParams.get("next"))
  const authorizeUrl = new URL(discordAuthorizeUrl)

  authorizeUrl.searchParams.set("client_id", getDiscordClientId(env))
  authorizeUrl.searchParams.set("redirect_uri", getDiscordRedirectUri())
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("scope", "identify")
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("prompt", "none")

  const isSecure = requestUrl.protocol === "https:"
  const headers = new Headers({
    location: authorizeUrl.toString(),
  })

  headers.append(
    "set-cookie",
    `wasans_discord_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isSecure ? "; Secure" : ""}`
  )
  headers.append(
    "set-cookie",
    `wasans_discord_oauth_next=${encodeURIComponent(nextUrl)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isSecure ? "; Secure" : ""}`
  )

  return new Response(null, {
    status: 302,
    headers,
  })
}
