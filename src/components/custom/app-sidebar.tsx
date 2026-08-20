"use client"

import type { ComponentType, ReactNode } from "react"
import { Fragment, useEffect, useState } from "react"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { FloatingSettingsModal } from "@/components/custom/settings-provider"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { apiV1, apiV2 } from "@/lib/api"
import {
  ArrowRightLeftIcon,
  BookIcon,
  CalculatorIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HelpCircleIcon,
  HistoryIcon,
  HomeIcon,
  LogInIcon,
  MedalIcon,
  OctagonAlertIcon,
  ShieldIcon,
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
  data?: { user: AuthUser | null }
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

function isRouteActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

const primaryLinks = [
  { href: "/", label: "Overview", icon: HomeIcon },
  { href: "/rules", label: "Rules", icon: BookIcon },
  { href: "/information", label: "Information", icon: HelpCircleIcon },
]

const toolLinks = [
  { href: "/calculator", label: "Calculator", icon: CalculatorIcon },
  { href: "/compare", label: "Compare", icon: ArrowRightLeftIcon },
]

type SidebarLinkItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

type SidebarLinkGroup = SidebarLinkItem & {
  children?: SidebarLinkItem[]
}

const boardLinks: SidebarLinkGroup[] = [
  {
    href: "/wrs",
    label: "World Records",
    icon: MedalIcon,
    children: [{ href: "/wrs/history", label: "History", icon: HistoryIcon }],
  },
  { href: "/submissions", label: "Submissions", icon: TimerIcon },
  { href: "/players", label: "Leaderboard", icon: TrophyIcon },
]

function SidebarNavItem({
  item,
  pathname,
  onClick,
  leading,
  matchExact = false,
}: {
  item: SidebarLinkItem
  pathname: string
  onClick?: () => void
  leading?: ReactNode
  matchExact?: boolean
}) {
  const Icon = item.icon
  const active = matchExact ? pathname === item.href : isRouteActive(pathname, item.href)

  const content = (
    <div className="flex min-w-0 items-center gap-2">
      {leading ?? <Icon className="shrink-0" />}
      <span className="truncate">{item.label}</span>
    </div>
  )

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
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

function SidebarNavSubItem({ item, pathname }: { item: SidebarLinkItem; pathname: string }) {
  const Icon = item.icon

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isRouteActive(pathname, item.href)}>
        <Link href={item.href}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
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
        const response = await fetch(apiV2("/auth/me"))
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setUser(json.data?.user ?? null)
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
              <Fragment key={item.href}>
                <SidebarNavItem
                  item={item}
                  pathname={pathname}
                  matchExact={Boolean(item.children?.length)}
                />
                {item.children?.length && isRouteActive(pathname, item.href) ? (
                  <SidebarMenuSub>
                    {item.children.map((child) => (
                      <SidebarNavSubItem key={child.href} item={child} pathname={pathname} />
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </Fragment>
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

            {(user?.permission ?? 0) >= 2 && (
              <SidebarNavItem
                item={{ href: "/admin", label: "Admin", icon: ShieldIcon }}
                pathname={pathname}
              />
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <FloatingSettingsModal user={user} onLogout={() => setUser(null)} onUserUpdate={setUser} />
          </SidebarMenuItem>
        </SidebarMenu>

        {user ? (
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-sidebar-border/70 p-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5">
            <Link href={`/players/${encodeURIComponent(user.uuid)}`} aria-label={`Open ${user.player_name} profile`}>
              <PlayerAvatar
                playerName={user.player_name}
                discordId={user.player_id}
                discordAvatar={user.discord_avatar}
                discordDiscriminator={user.discord_discriminator}
              />
            </Link>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <Link
                href={`/players/${encodeURIComponent(user.uuid)}`}
                className="truncate text-sm font-medium text-primary underline underline-offset-2"
              >
                {formatPlayerNameWithScore(user.player_name, user.score)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {user.permission >= 2 ? "Owner" : user.permission >= 1 ? "Moderator" : "Member"}
              </p>
            </div>
          </div>
        ) : (
          <div className="group-data-[collapsible=icon]:hidden">
            <a
              href={apiV2("/auth/discord/start")}
              target="_blank"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogInIcon className="size-4" />
              <span>Login with Discord</span>
            </a>
            <p className="px-2 text-[11px] leading-5 text-muted-foreground">
              By logging in, you agree to{" "}
              <Link href="/terms" className="underline underline-offset-3">Terms</Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-3">Privacy</Link>.
            </p>
          </div>
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
