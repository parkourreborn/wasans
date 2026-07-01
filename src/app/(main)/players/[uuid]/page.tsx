"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { apiV1 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { TrialName } from "@/lib/trials"
import { formatPlayerScore } from "@/lib/player-score"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import Badges from "@/components/custom/badges"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/components/ui/spinner"

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
  player_name: string
  score: number
  date_joined: string
  rank: number
  pbs?: PlayerPb[]
}

type WorldRecordValue = {
  trial_name: string
  time: number | string
}

type SubmissionValue = {
  uuid: string
  trial_name: string
  time: number | string
  state: "approved" | "pending" | "denied"
  date: string
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
        setError(err instanceof Error ? err.message : "Unable to load profile")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [uuid])

  const wrByTrial = React.useMemo(() => {
    return new Map(worldRecords.map((wr) => [wr.trial_name.toUpperCase(), Number(wr.time)]))
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

  const filteredPbs = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return pbRows
    }

    return pbRows.filter((row) => {
      return (
        row.trial_name.toLowerCase().includes(query)
        || String(row.time).includes(query)
        || formatDate(row.date).toLowerCase().includes(query)
      )
    })
  }, [pbRows, search])

  const filteredSubmissions = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return submissionRows
    }

    return submissionRows.filter((row) => {
      return (
        row.trial_name.toLowerCase().includes(query)
        || row.state.toLowerCase().includes(query)
        || row.uuid.toLowerCase().includes(query)
        || String(row.time).includes(query)
        || formatDate(row.date).toLowerCase().includes(query)
      )
    })
  }, [search, submissionRows])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (!player) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Player not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <PlayerAvatar playerName={player.player_name} discordId={player.player_id} size="lg" />
          <div>
            <h1 className="text-3xl font-bold">{player.player_name}</h1>
            <p className="text-sm text-muted-foreground">Joined {formatDate(player.date_joined)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/leaderboard">View Rank</Link>
          </Button>
          <Button asChild>
            <Link href={`/calculator?player_uuid=${encodeURIComponent(player.uuid)}`}>View in Calculator</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Overall Rank</p>
            <p className="text-4xl font-bold text-primary">#{player.rank}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Wasans Score</p>
            <p className="text-4xl font-semibold">{formatPlayerScore(player.score)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={mode} onValueChange={(value) => setMode(value as ViewMode)}>
              <TabsList>
                <TabsTrigger value="submissions">All Submissions</TabsTrigger>
                <TabsTrigger value="pbs">Personal Bests</TabsTrigger>
              </TabsList>
            </Tabs>

            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={mode === "submissions" ? "Search submissions by trial, state, time, date, uuid" : "Search PBs by trial, time, date"}
              className="w-full lg:max-w-md"
            />
          </div>

          <div className="grid gap-3">
            {mode === "submissions" ? (
              filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((row) => (
                  <Card key={row.uuid} className="overflow-hidden">
                    <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="space-y-1">
                        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{row.trial_name}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-2xl font-semibold">{formatTime(row.time)}</p>
                          <Badges badges={[row.state]} className="gap-2" />
                        </div>
                        <p className="text-sm text-muted-foreground">Date: {formatDate(row.date)} · Score: {row.score.toFixed(3)}</p>
                      </div>

                      <Button variant="outline" asChild>
                        <Link href={`/submissions/${encodeURIComponent(row.uuid)}`}>View submission</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="rounded-xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
                  No matching submissions.
                </div>
              )
            ) : filteredPbs.length > 0 ? (
              filteredPbs.map((row) => (
                <Card key={`${row.submission_uuid}-${row.trial_name}`} className="overflow-hidden">
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="space-y-1">
                      <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{row.trial_name}</p>
                      <p className="text-2xl font-semibold">{formatTime(row.time)}</p>
                      <p className="text-sm text-muted-foreground">Date: {formatDate(row.date)} · Score: {row.score.toFixed(3)}</p>
                    </div>

                    <Button variant="outline" asChild>
                      <Link href={`/submissions/${encodeURIComponent(row.submission_uuid)}`}>View submission</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="rounded-xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
                No matching personal bests.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
