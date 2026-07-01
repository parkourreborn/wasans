"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getDiscordDefaultAvatarUrl, getNameInitials } from "@/lib/discord-avatar"

type PlayerAvatarProps = {
  playerName?: string | null
  discordId?: string | null
  size?: "sm" | "default" | "lg"
  className?: string
}

export function PlayerAvatar({ playerName, discordId, size = "default", className }: PlayerAvatarProps) {
  const avatarUrl = getDiscordDefaultAvatarUrl(discordId)
  const fallback = getNameInitials(playerName)

  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${playerName || "Player"} avatar`} /> : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
