type DiscordAvatarParams = {
  discordId?: string | null
  avatarHash?: string | null
  discriminator?: string | null
  size?: 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096
  // Google account ids are also plain digit strings, the same shape as a
  // Discord snowflake, so the numeric-shape checks below can't tell them
  // apart on their own -- they'd otherwise synthesize a plausible-looking
  // but fake Discord "embed avatar" URL for a Google-only player. Pass this
  // whenever it's known so non-Discord players short-circuit straight to
  // the empty string (initials fallback) instead.
  authProvider?: string | null
}

export function getDiscordDefaultAvatarUrl(discordId?: string | null, discriminator?: string | null, authProvider?: string | null) {
  if (authProvider && authProvider !== "discord") {
    return ""
  }

  const id = String(discordId || "").trim()
  const discriminatorValue = String(discriminator || "").trim()

  if (/^\d+$/.test(discriminatorValue) && Number(discriminatorValue) > 0) {
    const index = Number(discriminatorValue) % 5
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`
  }

  if (/^\d+$/.test(id)) {
    const index = Number((BigInt(id) >> BigInt(22)) % BigInt(6))
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`
  }

  return ""
}

export function getDiscordAvatarUrl(params: DiscordAvatarParams) {
  if (params.authProvider && params.authProvider !== "discord") {
    return ""
  }

  const id = String(params.discordId || "").trim()
  const hash = String(params.avatarHash || "").trim()
  const size = params.size || 128

  if (/^\d+$/.test(id) && hash) {
    const extension = hash.startsWith("a_") ? "gif" : "png"
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${extension}?size=${size}`
  }

  return getDiscordDefaultAvatarUrl(id, params.discriminator, params.authProvider)
}

export function getNameInitials(name?: string | null) {
  const value = String(name || "").trim()
  if (!value) {
    return "WA"
  }

  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}
