"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import {
    ArrowRightLeftIcon,
  BookIcon,
  CalculatorIcon,
  ExternalLinkIcon,  FileTextIcon,  HelpCircleIcon,
  HomeIcon,
  LogInIcon,
  MedalIcon,
  OctagonAlertIcon,
  TimerIcon,
  TrophyIcon,
  UserSearchIcon
} from "lucide-react"
import Link from "next/link"

type AuthUser = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  permission: number
}

type AuthResponse = {
  user: AuthUser | null
}

type AuditSummaryResponse = {
  summary?: {
    latest_error?: {
      id: number
      created_at: string
    } | null
  }
}

const discordInviteUrl = "https://discord.gg/9pnRYDU6wg"
const lastSeenErrorStorageKey = "wasans:last-seen-error-at"

export function AppSidebar() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [latestErrorAt, setLatestErrorAt] = useState<string | null>(null)
  const [lastSeenErrorAt, setLastSeenErrorAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(lastSeenErrorStorageKey)
  )
  const playerId = user?.player_id || ""

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me")
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setUser(json.user)
        }
      } catch (err) {
        console.error(err)
      }
    }

    loadUser()
  }, [])

  useEffect(() => {
    const updateLastSeen = () => {
      setLastSeenErrorAt(window.localStorage.getItem(lastSeenErrorStorageKey))
    }

    window.addEventListener("storage", updateLastSeen)
    window.addEventListener("wasans:last-seen-error-updated", updateLastSeen)

    return () => {
      window.removeEventListener("storage", updateLastSeen)
      window.removeEventListener("wasans:last-seen-error-updated", updateLastSeen)
    }
  }, [])

  useEffect(() => {
    if ((user?.permission ?? 0) < 1) {
      return
    }

    const loadAuditSummary = async () => {
      try {
        const response = await fetch("/api/audit-logs?limit=1&kind=errors", { cache: "no-store" })
        const json = (await response.json()) as AuditSummaryResponse

        if (response.ok) {
          setLatestErrorAt(json.summary?.latest_error?.created_at || null)
        }
      } catch (err) {
        console.error(err)
      }
    }

    loadAuditSummary()
    const interval = window.setInterval(loadAuditSummary, 60000)

    return () => window.clearInterval(interval)
  }, [user])

  const avatarUrl = useMemo(() => {
    if (!playerId || !/^\d+$/.test(playerId)) {
      return ""
    }

    const lastDigit = Number(playerId.slice(-1))
    return `https://cdn.discordapp.com/embed/avatars/${lastDigit % 5}.png`
  }, [playerId])

  const fallback = user?.player_name?.slice(0, 2).toUpperCase() || "WA"
  const hasNewErrors = Boolean(latestErrorAt && (!lastSeenErrorAt || latestErrorAt > lastSeenErrorAt))

  return (
    <Sidebar collapsible="icon">
        <SidebarHeader className="flex items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold italic group-data-[collapsible=icon]:hidden">hi i wasans</h2>
            <SidebarTrigger className="p-2" />
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup>

                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/">
                                <div className="flex items-center gap-2">
                                    <HomeIcon />
                                    <span>Home</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/rules">
                                <div className="flex items-center gap-2">
                                    <BookIcon />
                                    <span>Rules</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/information">
                                <div className="flex items-center gap-2">
                                    <HelpCircleIcon />
                                    <span>Information</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarSeparator />

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/calculator">
                                <div className="flex items-center gap-2">
                                    <CalculatorIcon />
                                    <span>Calculator</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/compare">
                                <div className="flex items-center gap-2">
                                    <ArrowRightLeftIcon />
                                    <span>Compare</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarSeparator />

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/wrs">
                                <div className="flex items-center gap-2">
                                    <MedalIcon />
                                    <span>WRs</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/submissions">
                                <div className="flex items-center gap-2">
                                    <TimerIcon />
                                    <span>Submissions</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/leaderboard">
                                <div className="flex items-center gap-2">
                                    <TrophyIcon />
                                    <span>Leaderboard</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link href="/players">
                                <div className="flex items-center gap-2">
                                    <UserSearchIcon />
                                    <span>Player Search</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    {(user?.permission ?? 0) >= 1 && (
                      <>
                        <SidebarSeparator />
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild>
                            <Link href="/logs">
                              <div className="flex w-full items-center gap-2">
                                <div className="relative">
                                  <FileTextIcon />
                                  {hasNewErrors && (
                                    <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-destructive ring-2 ring-sidebar">
                                      <OctagonAlertIcon className="size-2 text-destructive-foreground" />
                                    </span>
                                  )}
                                </div>
                                <span>Logs</span>
                              </div>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </>
                    )}

                </SidebarMenu>

            </SidebarGroup>

        </SidebarContent>
        <SidebarFooter className="gap-3">
            {user && (
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-sidebar-border p-2">
                    <Avatar>
                        {avatarUrl && <AvatarImage src={avatarUrl} alt={`${user.player_name} avatar`} />}
                        <AvatarFallback>{fallback}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <Link
                            href={`/players/${encodeURIComponent(user.uuid)}`}
                            className="truncate text-sm font-medium text-sky-600 underline underline-offset-2"
                        >
                            {formatPlayerNameWithScore(user.player_name, user.score)}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                            {user.permission >= 1 ? "Moderator" : "Member"}
                        </p>
                    </div>
                </div>
            )}
            {!user && (
                <a
                    href="/api/auth/discord/start"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                >
                    <LogInIcon className="size-4" />
                    <span>Login with Discord</span>
                </a>
            )}
            <Link
                href={discordInviteUrl}
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
            >
                <ExternalLinkIcon className="size-4" />
                <span>Discord</span>
            </Link>
        </SidebarFooter>
    </Sidebar>
  )
}
