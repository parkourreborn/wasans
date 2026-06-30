import { GET as getOverallLeaderboard } from "@/app/api/v1/leaderboards/overall/route"
import { GET as getTrialLeaderboard } from "@/app/api/v1/leaderboards/trials/[trial]/route"
import { POST as refreshLeaderboard } from "@/app/api/v1/leaderboards/refresh/route"
import { withDeprecationHeaders } from "@/lib/server/deprecation"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const trialName = url.searchParams.get("trialName")?.trim() || null

  if (trialName) {
    return withDeprecationHeaders(await getTrialLeaderboard(request, { params: Promise.resolve({ trial: trialName }) }))
  }

  return withDeprecationHeaders(await getOverallLeaderboard(request))
}

export async function POST(request: Request) {
  return withDeprecationHeaders(await refreshLeaderboard(request))
}