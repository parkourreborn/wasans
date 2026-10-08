"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckIcon, GiftIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDelta, formatRelative, formatScore, formatTime } from "@/lib/format"
import { howToWin } from "@/lib/prizes"
import { tierForScore } from "@/lib/tiers"
import { cn } from "@/lib/utils"
import { invalidateApi, useApi } from "@/hooks/use-api"
import { useComboCategories } from "@/hooks/use-combo-categories"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useLoginDialog } from "@/components/site/login-dialog"
import { runPosterUrl, runVideoUrl } from "@/components/site/run-video"
import { TierLabel } from "@/components/site/tier-label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { ActiveGiveaway, ActivePrize, RecordBreak, TopPlayer } from "@/components/site/home/home-data"

export const runHref = (uuid: string) => `/submissions/${encodeURIComponent(uuid)}`
export const playerHref = (uuid: string) => `/players/${encodeURIComponent(uuid)}`

const medalColors = ["text-gold", "text-silver", "text-bronze"]

export function SectionHead({ id, title, description, href, linkLabel }: { id: string; title: string; description?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-line pb-2.5">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="font-display text-[30px] font-extrabold uppercase leading-[0.9]">
          {title}
        </h2>
        {description ? <p className="text-[13px] text-subtle-foreground">{description}</p> : null}
      </div>
      {href && linkLabel ? (
        <Link href={href} className="label-caps shrink-0 text-[13px] text-muted-foreground hover:text-foreground">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  )
}

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

// The latest record's clip, playing muted on a loop behind its details.
// With reduced motion it waits for a click instead.
export function RecordClip({ record, now }: { record: RecordBreak | null; now: number }) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true
  )
  const [failed, setFailed] = useState<string | null>(null)
  const playable = record && record.video_status !== "failed" && record.video_status !== "processing" && failed !== record.uuid

  return (
    <figure className="relative m-0 min-w-0 self-start overflow-hidden rounded-md border border-line-strong bg-surface">
      {/* On phones the caption sits under the clip; from sm up it overlays it. */}
      <div className="aspect-video bg-black">
        {!record ? (
          <Skeleton className="size-full rounded-none bg-surface-2" />
        ) : playable ? (
          <video
            key={record.uuid}
            src={runVideoUrl(record.uuid)}
            poster={runPosterUrl(record.uuid)}
            autoPlay={!reducedMotion}
            controls={reducedMotion}
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setFailed(record.uuid)}
            aria-label={`${record.trial_name} world record by ${record.player_name}`}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full bg-surface-2" />
        )}
      </div>
      {record ? (
        <figcaption className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-background/80 sm:px-5 sm:py-4 sm:backdrop-blur-sm">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="label-caps text-[13px] text-gold">New world record · {formatRelative(record.date, now)}</span>
            <Link href={runHref(record.uuid)} className="font-display text-[34px] font-extrabold uppercase leading-[0.9] hover:text-primary sm:text-[44px]">
              {record.trial_name} <span className="num text-[26px] font-semibold text-gold sm:text-[34px]">{formatTime(record.time)}</span>
            </Link>
          </div>
          <div className="flex flex-col gap-0.5 sm:items-end">
            <Link href={playerHref(record.player_uuid)} className="text-[17px] font-semibold hover:text-primary">
              {record.player_name}
            </Link>
            {record.previous ? (
              <span className="num text-[13px] text-success">{formatDelta(record.time - record.previous.time)} on the old record</span>
            ) : (
              <span className="text-[13px] text-muted-foreground">First record on this trial</span>
            )}
          </div>
        </figcaption>
      ) : null}
    </figure>
  )
}

// Rows of records with what each beat, for the dashboard.
export function RecordRows({ breaks, loading, empty }: { breaks: RecordBreak[]; loading: boolean; empty: string }) {
  if (loading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="my-2 h-9 w-full bg-surface" />
        ))}
      </div>
    )
  }
  if (breaks.length === 0) {
    return <p className="py-6 text-[15px] text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="m-0 list-none p-0">
      {breaks.map((entry, index) => (
        <li
          key={entry.uuid}
          className={cn(
            "relative grid min-h-13 grid-cols-[minmax(0,1fr)_5rem_4.5rem] items-center gap-3 border-b sm:grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_4.5rem] border-[#1c1c1c] px-3 transition-colors hover:bg-surface-3",
            index % 2 === 1 && "bg-surface"
          )}
        >
          <Link href={runHref(entry.uuid)} className="truncate font-display text-[20px] font-bold uppercase tracking-[0.03em] after:absolute after:inset-0">
            {entry.trial_name}
          </Link>
          <span className="num font-semibold text-gold">{formatTime(entry.time)}</span>
          <span className="hidden truncate sm:block">{entry.player_name}</span>
          <span className="num text-right text-[13px] text-success">{entry.previous ? formatDelta(entry.time - entry.previous.time) : "First"}</span>
        </li>
      ))}
    </ul>
  )
}

// The top of the leaderboard. `wide` adds the tier column.
export function TopPlayerRows({ players, loading, count, wide = false, highlight }: { players: TopPlayer[]; loading: boolean; count: number; wide?: boolean; highlight?: string | null }) {
  const grid = wide ? "grid-cols-[2.5rem_minmax(0,1fr)_7rem_4.5rem]" : "grid-cols-[1.75rem_minmax(0,1fr)_auto]"
  if (loading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="my-2 h-8 w-full bg-surface" />
        ))}
      </div>
    )
  }
  return (
    <div>
      {wide ? (
        <div className={cn("label-caps grid gap-3 border-b border-line px-3 py-2.5 text-[12px] text-subtle-foreground", grid)} aria-hidden>
          <span>#</span>
          <span>Player</span>
          <span>Tier</span>
          <span className="text-right">Score</span>
        </div>
      ) : null}
      <ol className="m-0 list-none p-0">
        {players.slice(0, count).map((player, index) => {
          const rank = player.rank ?? index + 1
          return (
            <li
              key={player.uuid}
              className={cn(
                "relative grid items-center gap-3 border-b border-[#1c1c1c] px-3 transition-colors hover:bg-surface-3",
                wide ? "min-h-12" : "min-h-11",
                grid,
                wide && index % 2 === 1 && "bg-surface",
                highlight === player.uuid && "bg-primary/10"
              )}
            >
              <span className={cn("num font-semibold", medalColors[rank - 1] ?? "text-subtle-foreground")}>{rank}</span>
              <Link href={playerHref(player.uuid)} className="truncate after:absolute after:inset-0">
                {player.player_name}
              </Link>
              {wide ? <TierLabel tier={tierForScore(Number(player.score))} className="text-[14px]" /> : null}
              <span className="num text-right">{formatScore(player.score)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type GiveawayDetail = { data?: { entry_count?: number; viewer_has_joined?: boolean } }

// A live giveaway with its countdown and a Join button.
export function GiveawayCard({ giveaway, now }: { giveaway: ActiveGiveaway; now: number }) {
  const { user } = useAuthSession()
  const { openLogin } = useLoginDialog()
  const detailUrl = apiV2(`/giveaways/${giveaway.uuid}`)
  const { data } = useApi<GiveawayDetail>(detailUrl)
  const [joining, setJoining] = useState(false)
  const joined = Boolean(data?.data?.viewer_has_joined)
  const entries = data?.data?.entry_count ?? 0

  const join = async () => {
    if (!user) {
      openLogin("Log in to join the giveaway.")
      return
    }
    setJoining(true)
    try {
      const response = await fetch(apiV2(`/giveaways/${giveaway.uuid}/join`), { method: "POST" })
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(json?.error?.message || "Couldn't join the giveaway. Try again.")
      toast.success(`You're in the ${giveaway.title} giveaway.`)
      invalidateApi(detailUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't join the giveaway. Try again.")
    } finally {
      setJoining(false)
    }
  }

  return (
    <section aria-labelledby={`giveaway-${giveaway.uuid}`} className="rounded-md border border-line-strong bg-surface">
      <div className="flex justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="label-caps flex items-center gap-1.5 text-[13px] text-primary">
          <GiftIcon className="size-3.5" aria-hidden />
          Giveaway
        </span>
        <span className="label-caps text-[13px] text-primary">Ends {formatRelative(giveaway.ends_at, now)}</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <h2 id={`giveaway-${giveaway.uuid}`} className="font-display text-[28px] font-extrabold uppercase leading-[0.9]">
          <Link href="/prizes" className="hover:text-primary">
            {giveaway.title}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="num text-foreground">{formatCount(entries)}</span> {entries === 1 ? "player" : "players"} in · {giveaway.max_winners}{" "}
          {giveaway.max_winners === 1 ? "winner" : "winners"}
        </p>
        {joined ? (
          <span className="label-caps flex h-11 items-center justify-center gap-1.5 rounded-md border border-success/40 text-[15px] text-success">
            <CheckIcon className="size-4" aria-hidden />
            You&apos;re in
          </span>
        ) : (
          <Button size="lg" className="h-11 w-full" onClick={() => void join()} disabled={joining}>
            {joining ? <Spinner className="size-4" /> : null}
            Join giveaway
          </Button>
        )}
      </div>
    </section>
  )
}

// A prize, shown when there's no giveaway to join.
export function PrizeTeaser({ prize, now, label = "Up for grabs" }: { prize: ActivePrize; now: number; label?: string }) {
  const { categories } = useComboCategories()
  return (
    <section aria-labelledby={`prize-${prize.uuid}`} className="rounded-md border border-line-strong bg-surface">
      <div className="flex justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="label-caps text-[13px] text-primary">{label}</span>
        <Link href="/prizes" className="label-caps text-[13px] text-muted-foreground hover:text-foreground">
          All prizes
        </Link>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <h2 id={`prize-${prize.uuid}`} className="font-display text-[26px] font-extrabold uppercase leading-[0.9]">
          {prize.title}
        </h2>
        <p className="text-[15px] text-muted-foreground">
          {howToWin(prize, (slug) => categories.find((category) => category.slug === slug)?.label)}
          {prize.ends_at ? ` Ends ${formatRelative(prize.ends_at, now)}.` : ""}
        </p>
      </div>
    </section>
  )
}
