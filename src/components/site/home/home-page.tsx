"use client"

import { useAuthSession } from "@/components/custom/use-auth-session"
import { HomeDashboard } from "@/components/site/home/home-dashboard"
import { HomeShowcase } from "@/components/site/home/home-showcase"
import { Skeleton } from "@/components/ui/skeleton"

// "/": your dashboard when logged in, the showcase otherwise (and when the
// session can't be checked, so the page is never empty).
export function HomePage() {
  const { status, user } = useAuthSession()

  if (user) return <HomeDashboard user={user} />
  if (status === "loading") {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-12" aria-busy="true">
        <Skeleton className="h-24 w-2/3 bg-surface" />
        <Skeleton className="h-72 w-full bg-surface" />
      </div>
    )
  }
  return <HomeShowcase />
}
