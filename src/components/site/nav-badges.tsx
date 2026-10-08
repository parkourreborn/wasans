"use client"

import { createContext, useContext } from "react"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useNavBadges } from "@/components/site/use-nav-badges"

type NavBadges = ReturnType<typeof useNavBadges>

const NavBadgesContext = createContext<NavBadges>({ newPrizes: false, newErrors: false, pendingCandidates: 0, pendingReviews: 0 })

// One poller for the whole shell; the top bar and the phone tab bar both
// read from it.
export function NavBadgesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthSession()
  const badges = useNavBadges(user?.permission ?? 0)
  return <NavBadgesContext.Provider value={badges}>{children}</NavBadgesContext.Provider>
}

export function useNavBadgeState() {
  return useContext(NavBadgesContext)
}
