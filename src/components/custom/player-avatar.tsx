"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { apiV2 } from "@/lib/api"
import { getDiscordAvatarUrl, getNameInitials } from "@/lib/discord-avatar"

type PlayerAvatarProps = {
  playerName?: string | null
  playerUuid?: string | null
  // The player picked a linked Roblox account's headshot as their avatar.
  // The Roblox id itself is never sent to clients; the image is served
  // through /v2/players/{uuid}/avatar.
  hasRobloxAvatar?: boolean | number | null
  // players.discord_id: only ever a real linked Discord account.
  discordId?: string | null
  discordAvatar?: string | null
  discordDiscriminator?: string | null
  size?: "sm" | "default" | "lg"
  className?: string
}

export function getPlayerAvatarUrl({
  playerUuid,
  hasRobloxAvatar,
  discordId,
  discordAvatar,
  discordDiscriminator,
}: Pick<PlayerAvatarProps, "playerUuid" | "hasRobloxAvatar" | "discordId" | "discordAvatar" | "discordDiscriminator">) {
  if (hasRobloxAvatar && playerUuid) {
    return apiV2(`/players/${encodeURIComponent(playerUuid)}/avatar`)
  }

  if (!discordId) {
    return ""
  }

  return getDiscordAvatarUrl({
    discordId,
    avatarHash: discordAvatar,
    discriminator: discordDiscriminator,
    size: 128,
  })
}

export function PlayerAvatar({
  playerName,
  playerUuid,
  hasRobloxAvatar,
  discordId,
  discordAvatar,
  discordDiscriminator,
  size = "default",
  className,
}: PlayerAvatarProps) {
  const avatarUrl = getPlayerAvatarUrl({ playerUuid, hasRobloxAvatar, discordId, discordAvatar, discordDiscriminator })
  const fallback = getNameInitials(playerName)

  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${playerName || "Player"} avatar`} /> : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
