"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PlusIcon, SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { AccountMenu } from "@/components/site/account-menu"
import { useLoginDialog } from "@/components/site/login-dialog"
import { MoreMenu } from "@/components/site/more-menu"
import { useNavBadgeState } from "@/components/site/nav-badges"
import { isNavItemActive, primaryNav, SUBMIT_HREF } from "@/components/site/nav-items"
import { SearchPalette, useSearchShortcut } from "@/components/site/search-palette"
import { Button } from "@/components/ui/button"

export function TopBar() {
  const pathname = usePathname()
  const { status, user } = useAuthSession()
  const { openLogin } = useLoginDialog()
  const badges = useNavBadgeState()
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  useSearchShortcut(openSearch)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <div className="mx-auto flex h-14 max-w-[1232px] items-center gap-4 px-4 md:gap-5 lg:gap-7">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Wasans home">
          <Image src="/images/logo-mark.png" alt="" width={22} height={28} priority unoptimized />
          <span className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.04em] md:hidden lg:inline">Wasans</span>
        </Link>

        <nav aria-label="Main" className="hidden h-14 items-stretch md:flex">
          {primaryNav.map((item) => {
            const active = isNavItemActive(item, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label-caps flex items-center px-2.5 text-[16px] transition-colors hover:text-foreground lg:px-3",
                  active ? "text-foreground shadow-[inset_0_-3px_0_var(--primary)]" : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}
          <MoreMenu newPrizes={badges.newPrizes} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            className="hidden h-9 w-64 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 text-sm text-subtle-foreground transition-colors hover:border-[#5a5a5a] hover:text-muted-foreground xl:flex"
          >
            <SearchIcon className="size-4" aria-hidden />
            Search players and trials
            <kbd className="ml-auto rounded border border-line-strong px-1.5 font-mono text-[11px]">/</kbd>
          </button>
          <Button variant="ghost" size="icon" className="xl:hidden" onClick={openSearch} aria-label="Search players and trials">
            <SearchIcon className="size-5" />
          </Button>

          {status === "anonymous" ? (
            <Button className="hidden md:inline-flex" onClick={() => openLogin("Log in to submit a run.")}>
              <PlusIcon className="size-4" strokeWidth={2.6} />
              Submit
            </Button>
          ) : (
            <Button asChild className="hidden md:inline-flex">
              <Link href={SUBMIT_HREF}>
                <PlusIcon className="size-4" strokeWidth={2.6} />
                Submit
              </Link>
            </Button>
          )}

          {user ? (
            <AccountMenu user={user} newErrors={badges.newErrors} pendingCandidates={badges.pendingCandidates} />
          ) : status === "anonymous" ? (
            <Button variant="outline" onClick={() => openLogin()}>
              Log in
            </Button>
          ) : (
            // Still checking, or the check failed: say nothing rather than
            // offer a login button to someone who may well be signed in.
            <div className="size-9" aria-hidden />
          )}
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
