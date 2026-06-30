"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { apiV1 } from "@/lib/api"
import calculateScore from "@/lib/calc-score"
import { trials as trialNames } from "@/lib/trials"
import { formatPlayerScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"

function formatTime(rawTime: number | string) {
  const timeStr = String(rawTime)
  const match = timeStr.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return timeStr
  }

  const [, seconds, ms] = match
  return `${String(Number(seconds))}.${ms.padEnd(3, "0")}`
}

function formatDate(timestamp: string) {
  const unixTime = Number(timestamp)
  if (!Number.isFinite(unixTime)) {
    return timestamp
  }
  const date = new Date(unixTime * 1000)
  return `${String(date.getMonth()+1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${date.getFullYear()}`
}

type PlayerInfo = {
  uuid: string
  player_id: string
  player_name: string
  score: number
  date_joined: string
  rank: number
}

type WorldRecordValue = {
  trial_name: string
  time: number | string
}

export default function PlayerProfilePage() {
  const { uuid } = useParams()
  const [player, setPlayer] = React.useState<PlayerInfo | null>(null)
  const [personalBestTimes, setPersonalBestTimes] = React.useState<Record<string, { time: string; submissionUuid: string; date: string }>>(() => {
    // Initialize with default values for all trials
    const defaults: Record<string, { time: string; submissionUuid: string; date: string }> = {}
    trialNames.forEach(trial => {
      defaults[trial.toUpperCase()] = { time: "0.000", submissionUuid: "", date: "" }
    })
    return defaults
  })
  const [worldRecords, setWorldRecords] = React.useState<WorldRecordValue[]>([])
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
        const [playerResponse, wrResponse] = await Promise.all([
          fetch(`${apiV1(`/players/${encodeURIComponent(uuid)}`)}?include=pbs`, { cache: "force-cache" }),
          fetch(apiV1("/records/world"), { cache: "force-cache" }),
        ])

        const playerJson = (await playerResponse.json()) as {
          player?: PlayerInfo | null
          error?: string
        }
        const pbsJson = playerJson as {
          pbs?: Array<{ trial_name: string; time: number; submission_uuid: string; date: string }>
          results?: Array<{ trial_name: string; time: number; submission_uuid: string; date: string }>
          error?: string
        }
        const wrJson = (await wrResponse.json()) as {
          results?: WorldRecordValue[]
          error?: string
        }

        if (!playerResponse.ok) {
          throw new Error(playerJson.error || "Unable to load player")
        }

        if (!wrResponse.ok) {
          throw new Error(wrJson.error || "Unable to load world records")
        }

        setPlayer(playerJson.player || null)
        setWorldRecords(wrJson.results || [])

        // Convert PB data to the format expected by the rest of the code
        const pbTimes: Record<string, { time: string; submissionUuid: string; date: string }> = {}
        const pbs = pbsJson.pbs || pbsJson.results || []

        for (const pb of pbs) {
          const trial = pb.trial_name.toUpperCase()
          pbTimes[trial] = {
            time: Number(pb.time).toFixed(3),
            submissionUuid: pb.submission_uuid,
            date: pb.date,
          }
        }

        // Fill in missing trials with default values
        const personalBestTimes = Object.fromEntries(
          trialNames.map((trial) => {
            const trialUpper = trial.toUpperCase()
            const bestResult = pbTimes[trialUpper]
            return [
              trialUpper,
              bestResult
                ? bestResult
                : { time: "0.000", submissionUuid: "", date: "" },
            ]
          })
        )

        setPersonalBestTimes(personalBestTimes)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load profile")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [uuid])

  const rows = React.useMemo(
    () =>
      trialNames.map((trialName) => {
        const trial = trialName.toUpperCase()
        const bestResult = personalBestTimes[trial] || { time: "0.000", submissionUuid: "", date: "" }
        const timeStr = bestResult.time
        const time = Number(timeStr)
        const wr = Number(
          worldRecords.find((record) => record.trial_name.toUpperCase() === trial)?.time || 0
        )

        return {
          trial: trialName,
          time: timeStr,
          submissionUuid: bestResult.submissionUuid,
          date: bestResult.date,
          score:
            Number.isFinite(time) && time > 0 && Number.isFinite(wr) && wr > 0
              ? Number(calculateScore(wr, time, trialName).toFixed(3))
              : 0,
        }
      }),
    [personalBestTimes, worldRecords]
  )

  const calculatedScore = React.useMemo(() => {
    if (!rows.length) return 0
    return Number((rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(3))
  }, [rows])

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{player.player_name}</h1>
          <p className="text-sm text-muted-foreground">Joined {formatDate(player.date_joined)}</p>
        </div>
        <div className="flex gap-4">
          <div className="rounded-3xl border border-border bg-muted px-4 py-3 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Overall Rank</p>
            <p className="text-4xl font-bold text-primary">#{player.rank}</p>
          </div>
          <div className="rounded-3xl border border-border bg-muted px-4 py-3 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Wasans score</p>
            <p className="text-4xl font-semibold">{formatPlayerScore(calculatedScore)}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Approved Times</h2>
              <p className="text-sm text-muted-foreground">Showing up to the first 50 approved submissions.</p>
            </div>
            <Link href={`/calculator?player_uuid=${encodeURIComponent(player.uuid)}`} className="text-sm text-sky-600 underline">
              View in calculator
            </Link>
          </div>

          <div className="grid gap-4 pt-4">
            {rows.filter((row) => row.submissionUuid).map((row) => (
              <Card key={row.trial} className="hover:shadow-lg transition-shadow overflow-hidden">
                <CardContent className="grid gap-4 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{row.trial}</p>
                      <h3 className="text-2xl font-semibold">{row.time}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Score</p>
                      <p className="text-3xl font-semibold">{row.score.toFixed(3)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Date: {formatDate(row.date)}</p>
                    </div>
                    <Link
                      href={`/submissions/${encodeURIComponent(row.submissionUuid)}`}
                      className="text-sky-600 underline underline-offset-4"
                    >
                      View submission
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}

            {rows.filter((row) => row.submissionUuid).length === 0 && (
              <div className="rounded-xl border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
                No personal best submissions available.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
