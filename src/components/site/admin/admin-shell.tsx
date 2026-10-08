"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useNavBadgeState } from "@/components/site/nav-badges"
import { AdminLoading } from "@/components/site/admin/admin-kit"
import { adminPageFor, adminPagesFor } from "@/components/site/admin/admin-nav"
import { useLoginDialog } from "@/components/site/login-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const listFormatter = new Intl.ListFormat("en", { type: "conjunction" })

const ROLE_LABELS = ["", "Combo moderator", "Moderator", "Moderator", "Owner"]

// Frames every /admin page: a side nav (a scrolling tab row on phones)
// listing only the pages the viewer can use, and a gate in front of the
// page itself.
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuthSession()
  const { newErrors, pendingCandidates } = useNavBadgeState()
  const pathname = usePathname()
  const router = useRouter()
  const { openLogin } = useLoginDialog()
  const permission = user?.permission ?? 0
  const pages = adminPagesFor(permission)
  const current = adminPageFor(pathname)
  // /admin is the owners' Overview; moderators land on their first page.
  const redirectTo = pathname === "/admin" && user && permission < 4 && pages.length > 0 ? pages[0].href : null

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  if (status === "loading" || redirectTo) {
    return <AdminLoading />
  }

  if (!user || pages.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-16">
        <h1 className="font-display text-[44px] font-extrabold uppercase leading-[0.9]">Admin</h1>
        <p className="text-[15px] text-muted-foreground">
          {user ? "This area is for staff. Your account doesn’t have access." : "Log in with a staff account to use the admin panel."}
        </p>
        {user ? (
          <Button asChild variant="outline">
            <Link href="/">Back to the leaderboard</Link>
          </Button>
        ) : (
          <Button onClick={() => openLogin()}>Log in</Button>
        )}
      </div>
    )
  }

  const allowed = current ? permission >= current.min : false

  return (
    <div className="mx-auto grid max-w-[1280px] gap-x-10 px-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <nav
        aria-label="Admin"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 py-2 md:sticky md:top-14 md:mx-0 md:h-[calc(100svh-3.5rem)] md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-0 md:py-8 md:pr-4"
      >
        <span className="label-caps hidden px-3 pb-2 text-[13px] text-subtle-foreground md:block">{ROLE_LABELS[permission] ?? "Staff"}</span>
        {pages.map((page) => {
          const active = current?.href === page.href
          const badge = page.href === "/admin/logs" ? newErrors : page.href === "/admin/prizes" ? pendingCandidates > 0 : false
          const badgeLabel = page.href === "/admin/logs" ? "new error" : `${pendingCandidates} to confirm`
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[15px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
                active && "bg-surface-2 text-foreground shadow-[inset_3px_0_0_var(--primary)] max-md:shadow-[inset_0_-2px_0_var(--primary)]"
              )}
            >
              {page.label}
              {badge ? (
                <span className="ml-auto flex items-center" aria-label={badgeLabel}>
                  <span className={cn("size-2 rounded-full", page.href === "/admin/logs" ? "bg-destructive" : "bg-primary")} aria-hidden />
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
      <div className="min-w-0 pt-8">
        {allowed ? (
          children
        ) : (
          <div className="flex max-w-md flex-col items-start gap-4 py-8">
            <h1 className="font-display text-[44px] font-extrabold uppercase leading-[0.9]">No access</h1>
            <p className="text-[15px] text-muted-foreground">
              {current ? `${current.label} is for owners.` : "That page doesn’t exist."} You can use {listFormatter.format(pages.map((page) => page.label))}.
            </p>
            <Button asChild variant="outline">
              <Link href={pages[0].href}>Open {pages[0].label}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
