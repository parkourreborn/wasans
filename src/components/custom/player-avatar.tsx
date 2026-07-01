"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getDiscordAvatarUrl, getNameInitials } from "@/lib/discord-avatar"

type PlayerAvatarProps = {
  playerName?: string | null
  discordId?: string | null
  discordAvatar?: string | null
  discordDiscriminator?: string | null
  size?: "sm" | "default" | "lg"
  className?: string
}

export function PlayerAvatar({
  playerName,
  discordId,
  discordAvatar,
  discordDiscriminator,
  size = "default",
  className,
}: PlayerAvatarProps) {
  const avatarUrl = getDiscordAvatarUrl({
    discordId,
    avatarHash: discordAvatar,
    discriminator: discordDiscriminator,
    size: 128,
  })
  const fallback = getNameInitials(playerName)

  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${playerName || "Player"} avatar`} /> : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
