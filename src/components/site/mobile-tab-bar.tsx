"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FilmIcon, MenuIcon, PlusIcon, TimerIcon, TrophyIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useLoginDialog } from "@/components/site/login-dialog"
import { useNavBadgeState } from "@/components/site/nav-badges"
import { isNavItemActive, moreNav, primaryNav, SUBMIT_HREF, type NavItem } from "@/components/site/nav-items"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

const [leaderboard, trials, combos, submissions] = primaryNav

const tabClass =
  "relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors"

function Tab({ item, icon: Icon, pathname }: { item: NavItem; icon: typeof TrophyIcon; pathname: string }) {
  const active = isNavItemActive(item, pathname)
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(tabClass, active ? "text-foreground" : "text-muted-foreground")}
    >
      {active ? <span className="absolute inset-x-4 top-0 h-[3px] bg-primary" aria-hidden /> : null}
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  )
}

// Phones: the main sections along the bottom, where a thumb reaches them,
// with Submit in the middle. Everything else is one tap away under More.
export function MobileTabBar() {
  const pathname = usePathname()
  const { status } = useAuthSession()
  const { openLogin } = useLoginDialog()
  const { newPrizes } = useNavBadgeState()
  const [moreOpen, setMoreOpen] = useState(false)
  const sheetItems = [combos, ...moreNav]
  const moreActive = sheetItems.some((item) => isNavItemActive(item, pathname))

  const submitInner = (
    <>
      <span className="flex h-7 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <PlusIcon className="size-5" strokeWidth={2.6} aria-hidden />
      </span>
      Submit
    </>
  )

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        <Tab item={leaderboard} icon={TrophyIcon} pathname={pathname} />
        <Tab item={trials} icon={TimerIcon} pathname={pathname} />
        {status === "anonymous" ? (
          <button
            type="button"
            className={cn(tabClass, "cursor-pointer text-foreground")}
            onClick={() => openLogin("Log in to submit a run.")}
          >
            {submitInner}
          </button>
        ) : (
          <Link href={SUBMIT_HREF} className={cn(tabClass, "text-foreground")}>
            {submitInner}
          </Link>
        )}
        <Tab item={submissions} icon={FilmIcon} pathname={pathname} />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(tabClass, "cursor-pointer", moreActive ? "text-foreground" : "text-muted-foreground")}
          aria-label={newPrizes ? "More, new prize" : "More"}
        >
          {moreActive ? <span className="absolute inset-x-4 top-0 h-[3px] bg-primary" aria-hidden /> : null}
          <span className="relative">
            <MenuIcon className="size-5" aria-hidden />
            {newPrizes ? (
              <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden />
            ) : null}
          </span>
          More
        </button>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-xl border-line-strong bg-surface-2 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-5 pb-2 pt-5">
            <SheetTitle className="label-caps text-lg">More</SheetTitle>
            <SheetDescription className="sr-only">Other pages on the site</SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col px-2 pb-4">
            {sheetItems.map((item) => {
              const active = isNavItemActive(item, pathname)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-3",
                      active && "bg-surface-3"
                    )}
                  >
                    <span className="flex flex-col">
                      <span className="text-[15px] font-medium">{item.label}</span>
                      {item.description ? <span className="text-[13px] text-muted-foreground">{item.description}</span> : null}
                    </span>
                    {item.href === "/prizes" && newPrizes ? <span className="label-caps text-[12px] text-primary">New</span> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
