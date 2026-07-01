"use client"

import type { CSSProperties, ComponentType, ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { apiV1 } from "@/lib/api"
import { getRouteTheme, isRouteActive } from "@/lib/route-theme"
import {
  ArrowRightLeftIcon,
  BookIcon,
  CalculatorIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HelpCircleIcon,
  HomeIcon,
  LogInIcon,
  MedalIcon,
  OctagonAlertIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react"

type AuthUser = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
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

const primaryLinks = [
  { href: "/", label: "Overview", icon: HomeIcon },
  { href: "/rules", label: "Rules", icon: BookIcon },
  { href: "/information", label: "Information", icon: HelpCircleIcon },
]

const toolLinks = [
  { href: "/calculator", label: "Calculator", icon: CalculatorIcon },
  { href: "/compare", label: "Compare", icon: ArrowRightLeftIcon },
]

const boardLinks = [
  { href: "/wrs", label: "World Records", icon: MedalIcon },
  { href: "/submissions", label: "Submissions", icon: TimerIcon },
  { href: "/players", label: "Leaderboard", icon: TrophyIcon },
]

type SidebarLinkItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

function SidebarNavItem({
  item,
  pathname,
  onClick,
  leading,
}: {
  item: SidebarLinkItem
  pathname: string
  onClick?: () => void
  leading?: ReactNode
}) {
  const Icon = item.icon
  const theme = getRouteTheme(item.href)
  const active = isRouteActive(pathname, item.href)

  const content = (
    <div className="relative flex min-w-0 items-center gap-2">
      {leading ?? <Icon className="shrink-0" />}
      <span className="truncate">{item.label}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-(--page-accent) transition-transform duration-200 ease-out group-hover/menu-button:scale-x-100 group-focus-visible/menu-button:scale-x-100 group-data-[active=true]/menu-button:scale-x-100"
      />
    </div>
  )

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="relative overflow-visible data-[active=true]:bg-[color-mix(in_oklab,var(--page-accent)_14%,transparent)] data-[active=true]:font-semibold data-[active=true]:text-(--page-accent)"
        style={{ ["--page-accent" as string]: theme.accent } as CSSProperties}
      >
        {onClick ? (
          <button type="button" className="flex w-full items-center gap-2 text-left cursor-pointer" onClick={onClick}>
            {content}
          </button>
        ) : (
          <Link href={item.href}>{content}</Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [latestErrorAt, setLatestErrorAt] = useState<string | null>(null)
  const [lastSeenErrorAt, setLastSeenErrorAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(lastSeenErrorStorageKey)
  )

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch(apiV1("/auth/me"))
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
        const response = await fetch(`${apiV1("/admin/audit-logs")}?limit=1&kind=errors`, { cache: "no-store" })
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

  const hasNewErrors = Boolean(latestErrorAt && (!lastSeenErrorAt || latestErrorAt > lastSeenErrorAt))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Wasans</h2>
          <SidebarTrigger className="p-2" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {primaryLinks.map((item) => (
              <SidebarNavItem key={item.href} item={item} pathname={pathname} />
            ))}

            <SidebarSeparator />

            {toolLinks.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={() => {
                  if (pathname === item.href) {
                    window.history.replaceState(null, "", item.href)
                    router.replace(item.href)
                    router.refresh()
                    return
                  }

                  router.push(item.href)
                }}
              />
            ))}

            <SidebarSeparator />

            {boardLinks.map((item) => (
              <SidebarNavItem key={item.href} item={item} pathname={pathname} />
            ))}

            {(user?.permission ?? 0) >= 1 && (
              <>
                <SidebarSeparator />
                <SidebarNavItem
                  item={{ href: "/logs", label: "Logs", icon: FileTextIcon }}
                  pathname={pathname}
                  leading={
                    <div className="relative">
                      <FileTextIcon className="shrink-0" />
                      {hasNewErrors && (
                        <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-destructive ring-2 ring-sidebar">
                          <OctagonAlertIcon className="size-2 text-destructive-foreground" />
                        </span>
                      )}
                    </div>
                  }
                />
              </>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        {user ? (
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-sidebar-border/70 p-2.5">
            <PlayerAvatar
              playerName={user.player_name}
              discordId={user.player_id}
              discordAvatar={user.discord_avatar}
              discordDiscriminator={user.discord_discriminator}
            />
            <div className="min-w-0">
              <Link
                href={`/players/${encodeURIComponent(user.uuid)}`}
                className="truncate text-sm font-medium text-primary underline underline-offset-2"
              >
                {formatPlayerNameWithScore(user.player_name, user.score)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {user.permission >= 1 ? "Moderator" : "Member"}
              </p>
            </div>
          </div>
        ) : (
          <a
            href={apiV1("/auth/discord/start")}
            target="_blank"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
          >
            <LogInIcon className="size-4" />
            <span>Login with Discord</span>
          </a>
        )}

        <Link
          href={discordInviteUrl}
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
        >
          <ExternalLinkIcon className="size-4" />
          <span>Discord</span>
        </Link>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
