"use client"

import { apiV2 } from "@/lib/api"
import type { AnalyticsRange, StaffAnalytics } from "@/lib/analytics"
import { formatAge, formatCount } from "@/lib/format"
import { useApi } from "@/hooks/use-api"
import { Skeleton } from "@/components/ui/skeleton"
import { BarList, bucketLabel, Card, ColumnChart, SERIES_COLORS, Stat, StatGrid } from "./charts"
import { formatBytes, formatPct, formatSpan } from "./analytics-data"

type StaffResponse = { data?: StaffAnalytics }

const PROVIDERS = [
  { key: "discord", label: "Discord" },
  { key: "google", label: "Google" },
  { key: "roblox", label: "Roblox" },
] as const

// The moderators-and-up half of /analytics. The API refuses anyone else;
// the page only renders this for staff so nobody else sees an error.
export function StaffSection({ range, rangeLabel, now }: { range: AnalyticsRange; rangeLabel: string; now: number }) {
  const { data, error, loading } = useApi<StaffResponse>(`${apiV2("/analytics/staff")}?range=${range}`)
  const staff = data?.data
  const last = `last ${rangeLabel.toLowerCase()}`

  if (!staff) {
    if (error && !loading) return <p className="m-0 text-sm text-destructive">Couldn&apos;t load staff analytics: {error}</p>
    return <Skeleton className="h-[480px] w-full" />
  }

  const { moderation, video, accounts } = staff
  const approveRate = moderation.reviewed ? (moderation.approved / moderation.reviewed) * 100 : null
  const videoTotal = video.status.processing + video.status.ready + video.status.failed

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h3 className="font-display text-[24px] font-extrabold uppercase leading-none">Moderation</h3>
        <StatGrid>
          <Stat label="Waiting" value={formatCount(moderation.pending_trials)} sub={`${formatCount(moderation.pending_combos)} combos`} tone={moderation.pending_trials > 25 ? "warn" : undefined} />
          <Stat label="Oldest waiting" value={moderation.oldest_pending_at ? formatAge(moderation.oldest_pending_at, now) : "—"} sub="trial runs" />
          <Stat label="Reviewed" value={formatCount(moderation.reviewed)} sub={last} />
          <Stat label="Approve rate" value={formatPct(approveRate)} sub={`${formatCount(moderation.denied)} denied`} />
          <Stat label="Time to review" value={formatSpan(moderation.review_seconds.median)} sub={`median · p90 ${formatSpan(moderation.review_seconds.p90)}`} />
          <Stat label="Combos reviewed" value={formatCount(moderation.combos.approved + moderation.combos.denied)} sub={`${formatCount(moderation.combos.denied)} denied`} />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Queue" description="Trial runs waiting at the end of each period. Only reviews since review times were recorded can be placed.">
            <ColumnChart bucket={staff.bucket} series={[{ key: "queue", label: "Waiting", color: "var(--primary)", points: moderation.queue }]} />
          </Card>
          <Card title="Time to review" description="Median time from a run coming in to its review, by when it was reviewed.">
            <ColumnChart
              bucket={staff.bucket}
              format={formatSpan}
              series={[{ key: "median", label: "Median", color: "var(--primary)", points: moderation.review_seconds.series }]}
              empty="No reviews with a recorded time in this range."
            />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Moderators" description={`Reviews ${last}, with their median time to review.`} className="lg:col-span-2">
            {moderation.moderators.length ? (
              <div className="-mx-4 overflow-x-auto md:-mx-5">
                <table className="w-full min-w-[440px] border-collapse text-[14px]">
                  <thead>
                    <tr className="label-caps border-b border-line text-left text-[12px] text-subtle-foreground">
                      <th className="py-2 pl-4 font-semibold md:pl-5">Moderator</th>
                      <th className="px-2 py-2 text-right font-semibold">Approved</th>
                      <th className="px-2 py-2 text-right font-semibold">Denied</th>
                      <th className="px-2 py-2 text-right font-semibold">Deny rate</th>
                      <th className="px-2 py-2 text-right font-semibold">Combos</th>
                      <th className="py-2 pl-2 pr-4 text-right font-semibold md:pr-5">Median</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moderation.moderators.map((row) => (
                      <tr key={row.name} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pl-4 md:pl-5">{row.name}</td>
                        <td className="num px-2 text-right">{formatCount(row.approved)}</td>
                        <td className="num px-2 text-right">{formatCount(row.denied)}</td>
                        <td className="num px-2 text-right text-muted-foreground">
                          {row.approved + row.denied ? formatPct((row.denied / (row.approved + row.denied)) * 100, 0) : "—"}
                        </td>
                        <td className="num px-2 text-right">{formatCount(row.combos)}</td>
                        <td className="num py-1.5 pl-2 pr-4 text-right md:pr-5">{formatSpan(row.median_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">No reviews in this range.</p>
            )}
          </Card>
          <Card title="Waiting by trial">
            <BarList
              rows={moderation.pending_by_trial.map((row) => ({ key: row.trial_name, label: row.trial_name, value: row.count }))}
              empty="The queue is empty."
              limit={10}
            />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Approved and denied by trial"
            description={
              <span className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-success" /> Approved
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-destructive" /> Denied, with the deny rate on the right
                </span>
              </span>
            }
          >
            <BarList
              limit={12}
              rows={moderation.by_trial.map((row) => ({
                key: row.trial_name,
                label: row.trial_name,
                value: row.approved,
                color: "var(--success)",
                second: { value: row.denied, color: "var(--destructive)", label: "Denied" },
                display: `${formatCount(row.approved + row.denied)} · ${formatPct((row.denied / Math.max(1, row.approved + row.denied)) * 100, 0)}`,
              }))}
              empty="No reviews in this range."
            />
          </Card>
          <Card title="Common deny notes" description="Moderator notes on denied runs, grouped when they match exactly.">
            <BarList
              rows={moderation.deny_reasons.map((row, index) => ({ key: `${index}`, label: row.note, value: row.count, color: "var(--destructive)" }))}
              empty="No denied runs with a note in this range."
            />
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="font-display text-[24px] font-extrabold uppercase leading-none">Video pipeline</h3>
        <StatGrid>
          <Stat label="Processing now" value={formatCount(video.status.processing)} tone={video.status.processing > 10 ? "warn" : undefined} />
          <Stat label="Failed" value={formatCount(video.failed_in_range)} sub={`${last} · ${formatCount(video.status.failed)} all time`} tone={video.failed_in_range ? "warn" : undefined} />
          <Stat label="Failure rate" value={formatPct(videoTotal ? (video.status.failed / videoTotal) * 100 : null, 2)} sub="all time" />
          <Stat label="Processing time" value={formatSpan(video.processing_seconds.median)} sub={`median · p90 ${formatSpan(video.processing_seconds.p90)}`} />
          <Stat label="Originals kept" value={formatBytes(video.originals.bytes)} sub={`${formatCount(video.originals.count)} files`} />
          <Stat label="Uploads" value={formatBytes(video.uploads.bytes)} sub={`${formatCount(video.uploads.count)} · ${formatCount(video.uploads.unused)} never used`} />
        </StatGrid>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Failures over time">
            <ColumnChart bucket={staff.bucket} series={[{ key: "failed", label: "Failed", color: "var(--destructive)", points: video.failures }]} empty="No failures in this range." />
          </Card>
          <Card title="Why videos failed" description={`The most common errors, ${last}.`}>
            <BarList
              rows={video.reasons.map((row, index) => ({
                key: `${index}`,
                label: <span className="font-mono text-[12px]">{row.reason}</span>,
                value: row.count,
                color: "var(--destructive)",
              }))}
              empty="No failures in this range."
            />
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Video source" description={`Runs ${last}.`}>
            <BarList rows={video.sources.map((row) => ({ key: row.source, label: row.source, value: row.count }))} empty="No runs in this range." />
          </Card>
          <Card title="Resolution">
            <BarList rows={video.heights.map((row) => ({ key: row.label, label: row.label, value: row.count }))} empty="No runs in this range." />
          </Card>
          <Card title="Frame rate" description={video.median_duration != null ? `Median clip length ${video.median_duration}s.` : undefined}>
            <BarList rows={video.fps.map((row) => ({ key: row.label, label: row.label === "Unknown" ? row.label : `${row.label} fps`, value: row.count }))} empty="No runs in this range." />
          </Card>
        </div>
        {video.backfill.started && video.backfill.remaining > 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">
            Video backfill: {formatCount(video.backfill.remaining)} left, {formatCount(video.backfill.inFlight)} in flight, {formatCount(video.backfill.failed)} failed.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="font-display text-[24px] font-extrabold uppercase leading-none">Accounts</h3>
        <StatGrid>
          <Stat label="Seen today" value={formatCount(accounts.seen.day)} sub={`${formatCount(accounts.seen.week)} this week`} />
          <Stat label="Seen this month" value={formatCount(accounts.seen.month)} sub="signed-in players" />
          <Stat label="Never submitted" value={formatCount(accounts.never_submitted)} sub={`of ${formatCount(accounts.status.active)} active`} />
          <Stat label="Deactivated" value={formatCount(accounts.status.deactivated)} sub={`${formatCount(accounts.deactivated_in_range)} ${last}`} />
          <Stat label="Deleted" value={formatCount(accounts.status.deleted)} sub={`${formatCount(accounts.deleted_in_range)} ${last}`} />
          <Stat label="Submission bans" value={formatCount(accounts.bans)} sub={`${formatCount(accounts.bans_in_range)} new · ${formatCount(accounts.placeholders)} placeholders`} />
        </StatGrid>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card title="Sign-ups" description="New accounts by how they signed up.">
            <ColumnChart
              bucket={staff.bucket}
              series={PROVIDERS.map((provider, index) => ({
                key: provider.key,
                label: provider.label,
                color: SERIES_COLORS[index],
                points: accounts.signups[provider.key],
              }))}
              empty="No sign-ups in this range."
            />
          </Card>
          <Card title="Linked accounts" description={`${formatCount(accounts.multi_linked)} players have two or more providers linked.`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-[12px] text-subtle-foreground">Signed up with</span>
                <BarList rows={accounts.by_provider.map((row) => ({ key: row.provider, label: row.provider, value: row.count }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="label-caps text-[12px] text-subtle-foreground">Has linked</span>
                <BarList rows={accounts.linked.map((row) => ({ key: row.provider, label: row.provider, value: row.count }))} />
              </div>
            </div>
          </Card>
        </div>
        <Card
          title="Retention"
          description="Players who joined each month, and the share who submitted a run in their first week, in weeks 2–4 and in months 2–3. Recent months haven't had time to fill in."
        >
          {accounts.cohorts.length ? (
            <div className="-mx-4 overflow-x-auto md:-mx-5">
              <table className="w-full min-w-[520px] border-collapse text-[14px]">
                <thead>
                  <tr className="label-caps border-b border-line text-left text-[12px] text-subtle-foreground">
                    <th className="py-2 pl-4 font-semibold md:pl-5">Joined</th>
                    <th className="px-2 py-2 text-right font-semibold">Players</th>
                    <th className="px-2 py-2 text-right font-semibold">Ever submitted</th>
                    <th className="px-2 py-2 text-right font-semibold">Week 1</th>
                    <th className="px-2 py-2 text-right font-semibold">Weeks 2–4</th>
                    <th className="py-2 pl-2 pr-4 text-right font-semibold md:pr-5">Months 2–3</th>
                  </tr>
                </thead>
                <tbody>
                  {[...accounts.cohorts].reverse().map((row) => (
                    <tr key={row.month} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pl-4 md:pl-5">{bucketLabel(row.month, "month", true)}</td>
                      <td className="num px-2 text-right">{formatCount(row.size)}</td>
                      {[row.submitted, row.week1, row.week2to4, row.month2to3].map((value, index) => {
                        const pct = row.size ? (value / row.size) * 100 : 0
                        return (
                          <td
                            key={index}
                            className={`num px-2 text-right ${index === 3 ? "pr-4 md:pr-5" : ""}`}
                            style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(pct * 0.45)}%, transparent)` }}
                            title={`${formatCount(value)} of ${formatCount(row.size)}`}
                          >
                            {formatPct(pct, 0)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Nobody joined in the last year.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
