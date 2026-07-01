export function getDiscordDefaultAvatarUrl(discordId?: string | null) {
  const id = String(discordId || "").trim()
  if (!/^\d+$/.test(id)) {
    return ""
  }

  const lastDigit = Number(id.slice(-1))
  return `https://cdn.discordapp.com/embed/avatars/${lastDigit % 5}.png`
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
