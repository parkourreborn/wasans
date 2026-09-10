"use client"

import * as React from "react"
import { apiV2 } from "@/lib/api"
import { SectionCard, StatCard } from "@/components/custom/page-shell"
import { Skeleton } from "@/components/ui/skeleton"

type TrialPoint = { trial_name: string; mean: number; stddev: number; sample_size: number }
type Improver = { player_uuid: string; player_name: string; score_change: number }

type OverviewData = {
  player_stats: { total_players: number; average_score: number; median_score: number }
  hardest_trial: TrialPoint | null
  widest_spread_trial: TrialPoint | null
  most_contested_trial: TrialPoint | null
  biggest_improvers_7d: Improver[]
  biggest_improvers_30d: Improver[]
  approved_submissions_7d: number
}

type OverviewResponse = { data?: OverviewData }

function ImproverList({ title, improvers }: { title: string; improvers: Improver[] }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      {improvers.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {improvers.map((improver) => (
            <li key={improver.player_uuid} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">{improver.player_name}</span>
              <span className="shrink-0 font-mono text-foreground">+{improver.score_change.toFixed(3)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No improvements recorded yet.</p>
      )}
    </div>
  )
}

// Owner/moderator-only: site-wide rollups computed on demand from the live
// leaderboard (not cached -- this page is visited rarely enough that a
// precomputed cache isn't worth the staleness tradeoff).
export function AdminAnalyticsOverview() {
  const [data, setData] = React.useState<OverviewData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(apiV2("/admin/analytics/overview"), { cache: "no-store" })
        const json = (await response.json()) as OverviewResponse
        if (!cancelled) {
          setData(json.data || null)
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
  }, [])

  if (loading) {
    return (
      <SectionCard title="Site-wide analytics">
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SectionCard>
    )
  }

  if (!data) {
    return null
  }

  return (
    <SectionCard title="Site-wide analytics" description="Computed on demand from the live leaderboard.">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active players" value={data.player_stats.total_players} />
        <StatCard label="Average score" value={data.player_stats.average_score.toFixed(3)} />
        <StatCard label="Median score" value={data.player_stats.median_score.toFixed(3)} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Hardest trial"
          value={data.hardest_trial?.trial_name ?? "—"}
          meta={data.hardest_trial ? `avg score ${data.hardest_trial.mean.toFixed(3)}` : undefined}
        />
        <StatCard
          label="Widest spread"
          value={data.widest_spread_trial?.trial_name ?? "—"}
          meta={data.widest_spread_trial ? `stddev ${data.widest_spread_trial.stddev.toFixed(3)}` : undefined}
        />
        <StatCard
          label="Most contested"
          value={data.most_contested_trial?.trial_name ?? "—"}
          meta={data.most_contested_trial ? `${data.most_contested_trial.sample_size} players with a PB` : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ImproverList title="Biggest improvers (7 days)" improvers={data.biggest_improvers_7d} />
        <ImproverList title="Biggest improvers (30 days)" improvers={data.biggest_improvers_30d} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {data.approved_submissions_7d} approved submission{data.approved_submissions_7d === 1 ? "" : "s"} in the last 7 days.
      </p>
    </SectionCard>
  )
}
