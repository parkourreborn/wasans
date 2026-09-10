"use client"

import * as React from "react"
import { apiV2 } from "@/lib/api"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { SectionCard, StatCard } from "@/components/custom/page-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { TrialDistributionChart, type TrialDistributionPoint } from "@/components/custom/analytics/trial-distribution-chart"
import { ScoreHistoryChart, type ScoreHistoryRow } from "@/components/custom/analytics/score-history-chart"
import { RankHistoryChart, type RankHistoryRow } from "@/components/custom/analytics/rank-history-chart"
import { ActivityHeatmap, type ActivityDay } from "@/components/custom/analytics/activity-heatmap"

type AnalyticsResponse = {
  data?: {
    player_found: boolean
    trial_distributions: TrialDistributionPoint[]
    score_history: ScoreHistoryRow[]
    rank_history: RankHistoryRow[]
    activity_heatmap: ActivityDay[]
    last_pb_at: number | null
  }
}

type PrivateInsights = {
  next_role: { nextRoleName: string; scoreNeeded: number } | null
  score_change_7d: number | null
  score_change_30d: number | null
  weakest_trials: Array<{ trial_name: string; percentile: number }>
}

type PrivateInsightsResponse = { data?: { player_found: boolean } & PrivateInsights }

function formatDaysSince(unixSeconds: number | null) {
  if (!unixSeconds) {
    return "No PB yet"
  }
  const days = Math.floor((Date.now() / 1000 - unixSeconds) / 86400)
  if (days <= 0) {
    return "Today"
  }
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function formatScoreDelta(value: number | null) {
  if (value == null) {
    return "No data for this window yet"
  }
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(3)}`
}

export function PlayerAnalyticsSection({
  playerUuid,
  onSelectActivityDate,
}: {
  playerUuid: string
  onSelectActivityDate?: (isoDate: string) => void
}) {
  const session = useAuthSession()
  const [analytics, setAnalytics] = React.useState<AnalyticsResponse["data"] | null>(null)
  const [insights, setInsights] = React.useState<PrivateInsights | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Private insights are fetched only when viewing your own profile -- the
  // API also allows the site owner to view anyone's, but that path isn't
  // wired into this viewer to avoid duplicating the permission check here.
  const isOwnProfile = session.status === "authenticated" && session.user?.uuid === playerUuid

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const response = await fetch(apiV2(`/players/${encodeURIComponent(playerUuid)}/analytics`), { cache: "no-store" })
        const json = (await response.json()) as AnalyticsResponse
        if (!cancelled) {
          setAnalytics(json.data?.player_found ? json.data : null)
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [playerUuid])

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isOwnProfile) {
        setInsights(null)
        return
      }

      try {
        const response = await fetch(apiV2(`/players/${encodeURIComponent(playerUuid)}/analytics/private`), {
          cache: "no-store",
        })
        const json = (await response.json()) as PrivateInsightsResponse
        if (!cancelled && json.data?.player_found) {
          setInsights(json.data)
        }
      } catch (error) {
        console.error(error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isOwnProfile, playerUuid])

  if (loading) {
    return (
      <SectionCard title="Analytics">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SectionCard>
    )
  }

  if (!analytics) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Trials with a PB" value={analytics.trial_distributions.length} />
        <StatCard label="Last personal best" value={formatDaysSince(analytics.last_pb_at)} />
        <StatCard
          label="Recent activity"
          value={analytics.activity_heatmap.reduce((sum, day) => sum + day.count, 0)}
          meta="Approved submissions, last 12 weeks"
        />
      </div>

      {isOwnProfile && insights && (
        <SectionCard title="Your progress" description="Visible only to you">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Next rank"
              value={insights.next_role ? insights.next_role.nextRoleName : "Top rank reached"}
              meta={insights.next_role ? `${insights.next_role.scoreNeeded.toFixed(3)} score away` : undefined}
            />
            <StatCard label="Score change (7d)" value={formatScoreDelta(insights.score_change_7d)} />
            <StatCard label="Score change (30d)" value={formatScoreDelta(insights.score_change_30d)} />
          </div>
          {insights.weakest_trials.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Biggest opportunity: {insights.weakest_trials.map((trial) => `${trial.trial_name} (top ${Math.round(100 - trial.percentile)}%)`).join(", ")}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Score over time" description="Every time this player's score changed">
        <ScoreHistoryChart rows={analytics.score_history} />
      </SectionCard>

      <SectionCard title="Rank over time" description="Overall leaderboard position, snapshotted daily">
        <RankHistoryChart rows={analytics.rank_history} />
      </SectionCard>

      <SectionCard title="Activity" description="Approved submissions over the last 12 weeks — click a day to see what was submitted">
        <ActivityHeatmap days={analytics.activity_heatmap} onSelectDate={onSelectActivityDate} />
      </SectionCard>

      {analytics.trial_distributions.length > 0 && (
        <SectionCard title="Where they stand per trial" description="Each trial's score distribution, with this player's score marked">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.trial_distributions.map((point) => (
              <TrialDistributionChart key={point.trial_name} point={point} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
