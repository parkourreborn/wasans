"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ClipboardCheckIcon, FileTextIcon, ListVideoIcon, LogOutIcon, Settings2Icon, ShieldIcon, UserIcon } from "lucide-react"
import type { AuthSessionUser } from "@/lib/auth-session"
import { logout, permissionLabel } from "@/lib/auth-actions"
import { formatScore } from "@/lib/format"
import { openSettings } from "@/lib/linked-accounts"
import { tierForScore } from "@/lib/tiers"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { TierLabel } from "@/components/site/tier-label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const itemClass = "flex h-10 cursor-pointer items-center gap-3 px-3 text-[15px]"

function Dot({ label }: { label: string }) {
  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-primary">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {label}
    </span>
  )
}

export function AccountMenu({
  user,
  newErrors,
  pendingCandidates,
  pendingReviews,
}: {
  user: AuthSessionUser
  newErrors: boolean
  pendingCandidates: number
  pendingReviews: number
}) {
  const [loggingOut, setLoggingOut] = useState(false)
  const profileHref = `/players/${encodeURIComponent(user.uuid)}`
  const tier = tierForScore(Number(user.score))
  const attention = newErrors || pendingCandidates > 0

  const onLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logging out failed. Try again.")
      setLoggingOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={attention ? "Account menu, needs attention" : "Account menu"}
      >
        <PlayerAvatar
          className="size-9"
          playerName={user.player_name}
          playerUuid={user.uuid}
          hasRobloxAvatar={user.has_roblox_avatar}
          discordId={user.discord_id}
          discordAvatar={user.discord_avatar}
          discordDiscriminator={user.discord_discriminator}
        />
        {attention ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-lg border border-line-strong bg-surface-2 p-1.5 ring-0">
        <DropdownMenuLabel className="flex flex-col gap-1 px-3 py-2.5">
          <span className="truncate text-[15px] font-semibold text-foreground">{user.player_name}</span>
          <span className="flex items-center gap-2 text-sm font-normal">
            <TierLabel tier={tier} className="text-[14px]" />
            <span className="num text-muted-foreground">{formatScore(user.score)}</span>
          </span>
          {user.permission > 0 ? (
            <span className="text-xs font-normal text-subtle-foreground">{permissionLabel(user.permission)}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem asChild className={itemClass}>
          <Link href={profileHref}>
            <UserIcon className="size-4 text-muted-foreground" aria-hidden />
            Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClass}>
          <Link href={`/submissions/trials?player_uuid=${encodeURIComponent(user.uuid)}`}>
            <ListVideoIcon className="size-4 text-muted-foreground" aria-hidden />
            Your submissions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} onSelect={() => openSettings()}>
          <Settings2Icon className="size-4 text-muted-foreground" aria-hidden />
          Settings
        </DropdownMenuItem>
        {user.permission >= 1 ? (
          <>
            <DropdownMenuSeparator className="bg-line" />
            <DropdownMenuItem asChild className={itemClass}>
              <Link href="/review">
                <ClipboardCheckIcon className="size-4 text-muted-foreground" aria-hidden />
                Review queue
                {pendingReviews > 0 ? <span className="num ml-auto text-xs text-muted-foreground">{pendingReviews} waiting</span> : null}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {user.permission >= 2 ? (
          <>
            <DropdownMenuItem asChild className={itemClass}>
              <Link href="/logs">
                <FileTextIcon className="size-4 text-muted-foreground" aria-hidden />
                Logs
                {newErrors ? <Dot label="New error" /> : null}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {user.permission >= 4 ? (
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/admin">
              <ShieldIcon className="size-4 text-muted-foreground" aria-hidden />
              Admin
              {pendingCandidates > 0 ? <Dot label={`${pendingCandidates} to review`} /> : null}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem
          className={itemClass}
          disabled={loggingOut}
          onSelect={(event) => {
            event.preventDefault()
            void onLogout()
          }}
        >
          <LogOutIcon className="size-4 text-muted-foreground" aria-hidden />
          {loggingOut ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
