import type { Metadata } from "next"
import { Suspense } from "react"
import { Leaderboard } from "@/components/site/leaderboard"
import { LeaderboardFallback } from "@/components/site/leaderboard-fallback"

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Every Parkour Reborn time trial player, ranked by Wasans score.",
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LeaderboardFallback />}>
      <Leaderboard />
    </Suspense>
  )
}
