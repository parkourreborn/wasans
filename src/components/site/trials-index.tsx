"use client"

import { useMemo } from "react"
import Link from "next/link"
import { apiV2 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { daysBetween, formatAge, formatDate, formatDays, formatDelta, formatScore, formatTime } from "@/lib/format"
import { trialHref } from "@/lib/trial-slug"
import type { TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { useApi } from "@/hooks/use-api"
import { useNow } from "@/hooks/use-now"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PageHeader } from "@/components/site/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export type WorldRecord = {
  trial_name: string
  submission_uuid: string
  player_uuid: string
  player_name: string
  time: number
  date: number
  discord_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  has_roblox_avatar?: number | null
}

export type WorldRecordsResponse = { data?: WorldRecord[] }
type PlayerPb = { trial_name: string; time: number; submission_uuid: string; date: number }
type PlayerPbsResponse = { data?: { player: { pbs?: PlayerPb[] } | null } }

// Desktop: Trial | WR | Holder | Stood | Your PB | Gap | Score.
// Phones: Trial (holder under) | WR (stood under) | Your PB (score under).
const gridSignedIn =
  "grid grid-cols-[minmax(0,1fr)_5.25rem_5.25rem] md:grid-cols-[minmax(0,1.1fr)_6.5rem_minmax(0,1.3fr)_4.5rem_6.5rem_5.5rem_5rem] items-center"
const gridSignedOut =
  "grid grid-cols-[minmax(0,1fr)_5.25rem] md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.6fr)_6rem] items-center"

export function TrialsIndex() {
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const { user } = useAuthSession()
  const records = useApi<WorldRecordsResponse>(apiV2("/records/world"))
  const mine = useApi<PlayerPbsResponse>(user ? `${apiV2(`/players/${encodeURIComponent(user.uuid)}`)}?include=pbs` : null)
  const signedIn = Boolean(user)
  const now = useNow()

  const rows = useMemo(() => {
    const wrByTrial = new Map((records.data?.data ?? []).map((record) => [record.trial_name, record]))
    const pbByTrial = new Map((mine.data?.data?.player?.pbs ?? []).map((pb) => [pb.trial_name, pb]))

    return orderedTrialNames
      .map((trial) => {
        const wr = wrByTrial.get(trial) ?? null
        const pb = pbByTrial.get(trial) ?? null
        const wrTime = wr ? Number(wr.time) : null
        const pbTime = pb ? Number(pb.time) : null
        return {
          trial,
          wr,
          pb,
          retired: removedTrials.has(trial),
          gap: wrTime && pbTime ? pbTime - wrTime : null,
          score: wrTime && pbTime ? calculateScore(wrTime, pbTime, trial as TrialName) : null,
        }
      })
      // Retired trials last; sort is stable, so each group keeps the admin order.
      .sort((a, b) => Number(a.retired) - Number(b.retired))
  }, [orderedTrialNames, removedTrials, records.data, mine.data])

  const activeCount = rows.filter((row) => !row.retired).length
  const withPb = rows.filter((row) => !row.retired && row.pb).length
  const grid = signedIn ? gridSignedIn : gridSignedOut

  return (
    <>
      <PageHeader
        title="Trials"
        description="World records and full leaderboards for every trial. Open one to see every runner, the platinum and bronze times, and how the record has fallen."
      >
        {signedIn && mine.data ? (
          <p className="text-[15px] text-muted-foreground">
            <span className="num font-semibold text-foreground">
              {withPb}/{activeCount}
            </span>{" "}
            trials with a PB.{" "}
            {withPb < activeCount ? "A trial without one counts as 0 toward your score." : "You have a time on every trial."}
          </p>
        ) : null}
      </PageHeader>

      <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-6" aria-label="All trials">
        <div className="border-t border-line">
          <div className={cn(grid, "label-caps h-9 gap-x-3 border-b border-line px-3 text-[13px] text-subtle-foreground")} aria-hidden>
            <span>Trial</span>
            <span className="text-right md:text-left">WR</span>
            <span className="hidden md:block">Holder</span>
            <span className="hidden md:block">Stood</span>
            {signedIn ? (
              <>
                <span className="text-right md:text-left">Your PB</span>
                <span className="hidden text-right md:block">Gap</span>
                <span className="hidden text-right md:block">Score</span>
              </>
            ) : null}
          </div>

          {records.loading ? (
            <ul aria-label="Loading trials">
              {Array.from({ length: 12 }).map((_, index) => (
                <li key={index} className="flex h-14 items-center gap-4 border-b border-[#1c1c1c] px-3">
                  <Skeleton className="h-4 w-24 rounded-sm bg-surface-3" />
                  <Skeleton className="h-4 w-14 rounded-sm bg-surface-3" />
                  <Skeleton className="hidden h-4 w-32 rounded-sm bg-surface-3 md:block" />
                </li>
              ))}
            </ul>
          ) : records.error && !records.data ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <p className="text-[15px] text-muted-foreground">Couldn&apos;t load world records. {records.error}</p>
              <Button variant="outline" onClick={records.refetch}>
                Try again
              </Button>
            </div>
          ) : (
            <ul>
              {rows.map((row, index) => (
                <li
                  key={row.trial}
                  className={cn(
                    grid,
                    "relative min-h-14 gap-x-3 border-b border-[#1c1c1c] px-3 py-2 transition-colors hover:bg-surface-3",
                    index % 2 === 1 && "bg-surface"
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <Link href={trialHref(row.trial)} className="truncate font-display text-[19px] font-bold uppercase tracking-[0.03em] after:absolute after:inset-0">
                        {row.trial}
                      </Link>
                      {row.retired ? <span className="label-caps shrink-0 border border-line-strong px-1.5 text-[12px] text-muted-foreground">Retired</span> : null}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground md:hidden">
                      {row.wr ? row.wr.player_name : "No record yet"}
                    </span>
                  </span>

                  <span className="flex flex-col items-end md:items-start">
                    <span className={cn("num text-[15px] font-semibold", row.wr ? "text-gold" : "text-[#5a5a5a]")}>
                      {row.wr ? formatTime(row.wr.time) : "—"}
                    </span>
                    {row.wr ? (
                      <span className="num text-[12px] text-subtle-foreground md:hidden" title={`Set ${formatDate(row.wr.date)}`}>
                        {formatAge(row.wr.date, now)}
                      </span>
                    ) : null}
                  </span>

                  <span className="hidden min-w-0 items-center gap-2.5 md:flex">
                    {row.wr ? (
                      <>
                        <PlayerAvatar
                          size="sm"
                          className="size-6"
                          playerName={row.wr.player_name}
                          playerUuid={row.wr.player_uuid}
                          hasRobloxAvatar={row.wr.has_roblox_avatar}
                          discordId={row.wr.discord_id}
                          discordAvatar={row.wr.discord_avatar}
                          discordDiscriminator={row.wr.discord_discriminator}
                        />
                        <span className="truncate text-[15px]">{row.wr.player_name}</span>
                      </>
                    ) : (
                      <span className="text-sm text-subtle-foreground">No record yet</span>
                    )}
                  </span>

                  <span className="num hidden text-sm text-muted-foreground md:block" title={row.wr ? `Set ${formatDate(row.wr.date)}, ${formatDays(daysBetween(row.wr.date, now))} ago` : undefined}>
                    {row.wr ? formatAge(row.wr.date, now) : "—"}
                  </span>

                  {signedIn ? (
                    <>
                      <span className="flex flex-col items-end md:items-start">
                        <span className={cn("num text-[15px]", row.pb ? "font-medium" : "text-[#5a5a5a]")}>
                          {row.pb ? formatTime(row.pb.time) : mine.loading ? "…" : "—"}
                        </span>
                        {row.score != null ? (
                          <span className="num text-[12px] text-subtle-foreground md:hidden">{formatScore(row.score)}</span>
                        ) : null}
                      </span>
                      <span className="num hidden text-right text-[13px] text-subtle-foreground md:block">
                        {row.gap == null ? "" : row.gap === 0 ? <span className="label-caps text-gold">WR</span> : formatDelta(row.gap)}
                      </span>
                      <span className="num hidden text-right text-sm md:block">{row.score != null ? formatScore(row.score) : ""}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
