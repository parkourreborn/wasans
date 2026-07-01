type DiscordAvatarParams = {
  discordId?: string | null
  avatarHash?: string | null
  discriminator?: string | null
  size?: 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096
}

export function getDiscordDefaultAvatarUrl(discordId?: string | null, discriminator?: string | null) {
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
  const id = String(params.discordId || "").trim()
  const hash = String(params.avatarHash || "").trim()
  const size = params.size || 128

  if (/^\d+$/.test(id) && hash) {
    const extension = hash.startsWith("a_") ? "gif" : "png"
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${extension}?size=${size}`
  }

  return getDiscordDefaultAvatarUrl(id, params.discriminator)
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
