"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { apiV1 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { TrialName, trials } from "@/lib/trials"
import { formatPlayerScore } from "@/lib/player-score"
import { SubmissionCard } from "@/components/custom/submission-card"
import { ErrorState, PageShell, SubmissionList } from "@/components/custom/page-shell"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

function formatTime(rawTime: number | string) {
  const value = Number(rawTime)
  if (!Number.isFinite(value) || value <= 0) {
    return String(rawTime)
  }

  return value.toFixed(3)
}

function formatDate(timestamp: string) {
  const unixTime = Number(timestamp)
  if (!Number.isFinite(unixTime)) {
    return timestamp
  }

  const date = new Date(unixTime * 1000)
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${date.getFullYear()}`
}

type PlayerPb = {
  trial_name: string
  time: number
  submission_uuid: string
  date: string
}

type PlayerInfo = {
  uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  player_name: string
  score: number
  date_joined: string
  rank: number
  pbs?: PlayerPb[]
}

type WorldRecordValue = {
  trial_name: string
  time: number | string
  submission_uuid: string
}

type SubmissionValue = {
  uuid: string
  player_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  trial_name: string
  time: number | string
  state: "approved" | "pending" | "denied"
  date: string
  moderator_note?: string | null
  moderator_username?: string | null
}

type PlayerDetailResponse = {
  player?: PlayerInfo | null
  error?: string
}

type WorldRecordsResponse = {
  results?: WorldRecordValue[]
  error?: string
}

type SubmissionsResponse = {
  results?: SubmissionValue[]
  count?: number
  page?: number
  limit?: number
  error?: string
}

type ViewMode = "submissions" | "pbs"

const trialOrderByName = new Map(trials.map((trial, index) => [trial.toUpperCase(), index]))
const submissionUuidListKey = "submission_uuids"

function compareByTrialOrder(aTrialName: string, bTrialName: string) {
  const aOrder = trialOrderByName.get(String(aTrialName).toUpperCase())
  const bOrder = trialOrderByName.get(String(bTrialName).toUpperCase())

  if (aOrder == null && bOrder == null) {
    return aTrialName.localeCompare(bTrialName)
  }

  if (aOrder == null) {
    return 1
  }

  if (bOrder == null) {
    return -1
  }

  return aOrder - bOrder
}

async function fetchAllPlayerSubmissions(playerUuid: string) {
  const limit = 100
  const maxPages = 20
  const all: SubmissionValue[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      player_uuid: playerUuid,
      page: String(page),
      limit: String(limit),
    })

    const response = await fetch(`${apiV1("/submissions")}?${params.toString()}`, { cache: "no-store" })
    const json = (await response.json()) as SubmissionsResponse

    if (!response.ok) {
      throw new Error(json.error || "Unable to load submissions")
    }

    const pageResults = json.results || []
    all.push(...pageResults)

    const total = Number(json.count || all.length)
    if (all.length >= total || pageResults.length < limit) {
      break
    }
  }

  return all
}

export default function PlayerProfilePage() {
  const { uuid } = useParams()
  const router = useRouter()
  const [player, setPlayer] = React.useState<PlayerInfo | null>(null)
  const [worldRecords, setWorldRecords] = React.useState<WorldRecordValue[]>([])
  const [submissions, setSubmissions] = React.useState<SubmissionValue[]>([])
  const [mode, setMode] = React.useState<ViewMode>("submissions")
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!uuid || Array.isArray(uuid)) {
      return
    }

    const loadProfile = async () => {
      setLoading(true)
      setError(null)

      try {
        const [playerResponse, wrResponse, submissionRows] = await Promise.all([
          fetch(`${apiV1(`/players/${encodeURIComponent(uuid)}`)}?include=pbs`, { cache: "no-store" }),
          fetch(apiV1("/records/world"), { cache: "force-cache" }),
          fetchAllPlayerSubmissions(uuid),
        ])

        const playerJson = (await playerResponse.json()) as PlayerDetailResponse
        const wrJson = (await wrResponse.json()) as WorldRecordsResponse

        if (!playerResponse.ok) {
          throw new Error(playerJson.error || "Unable to load player")
        }

        if (!wrResponse.ok) {
          throw new Error(wrJson.error || "Unable to load world records")
        }

        setPlayer(playerJson.player || null)
        setWorldRecords(wrJson.results || [])
        setSubmissions(submissionRows)
      } catch (err) {
        console.error(err)
        setError("We couldn't load this profile right now.")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [uuid])

  const wrByTrial = React.useMemo(() => {
    return new Map(worldRecords.map((wr) => [wr.trial_name.toUpperCase(), Number(wr.time)]))
  }, [worldRecords])

  const wrSubmissionIds = React.useMemo(() => {
    return new Set(
      worldRecords
        .map((wr) => wr.submission_uuid)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  }, [worldRecords])

  const pbRows = React.useMemo(() => {
    const pbs = player?.pbs || []
    return pbs.map((pb) => {
      const wr = wrByTrial.get(pb.trial_name.toUpperCase()) || 0
      const time = Number(pb.time)
      const trialName = pb.trial_name as TrialName
      const score = Number.isFinite(wr) && wr > 0 && Number.isFinite(time) && time > 0
        ? Number(calculateScore(wr, time, trialName).toFixed(3))
        : 0

      return {
        ...pb,
        score,
      }
    })
  }, [player?.pbs, wrByTrial])

  const submissionRows = React.useMemo(() => {
    return submissions.map((submission) => {
      const wr = wrByTrial.get(submission.trial_name.toUpperCase()) || 0
      const time = Number(submission.time)
      const trialName = submission.trial_name as TrialName
      const score = Number.isFinite(wr) && wr > 0 && Number.isFinite(time) && time > 0
        ? Number(calculateScore(wr, time, trialName).toFixed(3))
        : 0

      return {
        ...submission,
        score,
      }
    })
  }, [submissions, wrByTrial])

  const orderedPbRows = React.useMemo(() => {
    return [...pbRows].sort((a, b) => compareByTrialOrder(a.trial_name, b.trial_name))
  }, [pbRows])

  const filteredPbs = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return orderedPbRows
    }

    return orderedPbRows.filter((row) => {
      return (
        row.trial_name.toLowerCase().includes(query)
        || String(row.time).includes(query)
        || formatDate(row.date).toLowerCase().includes(query)
      )
    })
  }, [orderedPbRows, search])

  const orderedSubmissionRows = React.useMemo(() => {
    return [...submissionRows].sort((a, b) => compareByTrialOrder(a.trial_name, b.trial_name))
  }, [submissionRows])

  const filteredSubmissions = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return orderedSubmissionRows
    }

    return orderedSubmissionRows.filter((row) => {
      return (
        row.trial_name.toLowerCase().includes(query)
        || row.state.toLowerCase().includes(query)
        || row.uuid.toLowerCase().includes(query)
        || String(row.time).includes(query)
        || formatDate(row.date).toLowerCase().includes(query)
      )
    })
  }, [orderedSubmissionRows, search])

  React.useEffect(() => {
    if (typeof window === "undefined" || loading || !player) {
      return
    }

    const visibleSubmissionUuids = mode === "submissions"
      ? filteredSubmissions.map((row) => row.uuid)
      : filteredPbs.map((row) => row.submission_uuid)

    window.localStorage.setItem(submissionUuidListKey, JSON.stringify(visibleSubmissionUuids))
  }, [filteredPbs, filteredSubmissions, loading, mode, player])

  if (loading) {
    return (
      <PageShell>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-10 w-36" />
            </div>
          </div>
          <Skeleton className="h-28 w-full" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>

        <SubmissionList className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-10 w-full lg:max-w-md" />
          </div>
          <div className="submissions-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="submission-grid-item">
                <Card className="h-full overflow-hidden border-border/60 bg-background/55">
                  <CardContent className="flex h-full min-h-0 gap-4 p-4">
                    <Skeleton className="flex-1 rounded-lg" />
                    <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                      <div className="space-y-2">
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </SubmissionList>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <ErrorState
          title="Profile unavailable"
          message={error}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push("/players")}>
                Back to players
              </Button>
            </>
          }
        />
      </PageShell>
    )
  }

  if (!player) {
    return (
      <PageShell>
        <ErrorState
          title="Player not found"
          message="That profile does not exist or is no longer available."
          actions={
            <Button type="button" variant="outline" onClick={() => router.push("/players")}>
              Back to players
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="space-y-4 rounded-3xl border border-border/60 bg-background/55 p-4 shadow-[0_24px_70px_-44px_rgba(0,0,0,0.72)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <PlayerAvatar
              playerName={player.player_name}
              discordId={player.player_id}
              discordAvatar={player.discord_avatar}
              discordDiscriminator={player.discord_discriminator}
              size="lg"
              className="size-20 shrink-0 lg:size-24"
            />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {player.player_name} ({formatPlayerScore(player.score)})
                </h1>
              </div>
              <p className="text-sm text-muted-foreground">Joined {formatDate(player.date_joined)}</p>
              <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-xl">
                Rank #{player.rank}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button className="cursor-pointer" asChild>
              <Link href={`/calculator?player_uuid=${encodeURIComponent(player.uuid)}`}>View in Calculator</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="sticky top-14 z-30 space-y-4 rounded-3xl border border-border/60 bg-background/80 p-4 backdrop-blur-xl md:top-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mode === "submissions" ? "Search submissions by trial, state, time, date, uuid" : "Search PBs by trial, time, date"}
            className="w-full min-w-0 lg:flex-1"
          />

          <div className="w-full lg:w-auto lg:shrink-0">
            <Tabs value={mode} onValueChange={(value) => setMode(value as ViewMode)}>
              <TabsList>
                <TabsTrigger className="cursor-pointer" value="submissions">All Submissions</TabsTrigger>
                <TabsTrigger className="cursor-pointer" value="pbs">Personal Bests</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <SubmissionList className="submissions-grid">
        {mode === "submissions" ? (
          filteredSubmissions.length > 0 ? (
            filteredSubmissions.map((row) => (
              <SubmissionCard
                key={row.uuid}
                submissionUuid={row.uuid}
                trialName={row.trial_name}
                timeText={formatTime(row.time)}
                playerUuid={player.uuid}
                playerName={player.player_name}
                playerScore={player.score}
                playerId={row.player_id ?? player.player_id}
                playerDiscordAvatar={row.discord_avatar ?? player.discord_avatar}
                playerDiscordDiscriminator={row.discord_discriminator ?? player.discord_discriminator}
                dateText={formatDate(row.date)}
                state={row.state}
                isWr={wrSubmissionIds.has(row.uuid)}
                scoreText={row.state !== "denied" ? row.score.toFixed(3) : undefined}
                moderatorNote={row.moderator_note}
                moderatorUsername={row.moderator_username}
                onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground backdrop-blur-xl">
              No matching submissions.
            </div>
          )
        ) : filteredPbs.length > 0 ? (
          filteredPbs.map((row) => (
            <SubmissionCard
              key={`${row.submission_uuid}-${row.trial_name}`}
              submissionUuid={row.submission_uuid}
              trialName={row.trial_name}
              timeText={formatTime(row.time)}
              playerUuid={player.uuid}
              playerName={player.player_name}
              playerScore={player.score}
              playerId={player.player_id}
              playerDiscordAvatar={player.discord_avatar}
              playerDiscordDiscriminator={player.discord_discriminator}
              dateText={formatDate(row.date)}
              state="approved"
              isWr={wrSubmissionIds.has(row.submission_uuid)}
              scoreText={row.score.toFixed(3)}
              onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground backdrop-blur-xl">
            No matching personal bests.
          </div>
        )}
      </SubmissionList>
    </PageShell>
  )
}
