import { Suspense } from "react"
import { Leaderboard } from "@/components/site/leaderboard"
import { LeaderboardFallback } from "@/components/site/leaderboard-fallback"

// The leaderboard stands in as the home page until the real one is
// designed; /leaderboard shows the same thing.
export default function HomePage() {
  return (
    <Suspense fallback={<LeaderboardFallback />}>
      <Leaderboard />
    </Suspense>
  )
}
