"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
}

type SubmissionValue = {
  uuid: string
  trial_name: string
  time: number | string
  state: string
}

type WorldRecordValue = {
  trial_name: string
  time: number | string
}

export default function PlayerProfilePage() {
  const { uuid } = useParams()
  const [player, setPlayer] = React.useState<PlayerInfo | null>(null)
  const [submissions, setSubmissions] = React.useState<SubmissionValue[]>([])
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
        const [playerResponse, submissionsResponse, wrResponse] = await Promise.all([
          fetch(`/api/players/${encodeURIComponent(uuid)}`, { cache: "force-cache" }),
          fetch(`/api/submissions/player/${encodeURIComponent(uuid)}?approvedOnly=true&page=1&limit=50`, {
            cache: "no-store",
          }),
          fetch(`/api/wrs`, { cache: "force-cache" }),
        ])

        const playerJson = (await playerResponse.json()) as {
          player?: PlayerInfo | null
          error?: string
        }
        const submissionsJson = (await submissionsResponse.json()) as {
          results?: SubmissionValue[]
          error?: string
        }
        const wrJson = (await wrResponse.json()) as {
          results?: WorldRecordValue[]
          error?: string
        }

        if (!playerResponse.ok) {
          throw new Error(playerJson.error || "Unable to load player")
        }

        if (!submissionsResponse.ok) {
          throw new Error(submissionsJson.error || "Unable to load submission history")
        }

        if (!wrResponse.ok) {
          throw new Error(wrJson.error || "Unable to load world records")
        }

        setPlayer(playerJson.player || null)
        setSubmissions(submissionsJson.results || [])
        setWorldRecords(wrJson.results || [])

        setPlayer(playerJson.player || null)
        setSubmissions(submissionsJson.results || [])
        setWorldRecords(wrJson.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load profile")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [uuid])

  const personalBestTimes = React.useMemo(() => {
    const best: Record<string, { time: number; submissionUuid: string }> = {}
    for (const submission of submissions) {
      const time = Number(submission.time)
      if (!submission.trial_name || submission.state !== "approved" || !Number.isFinite(time) || time <= 0) {
        continue
      }
      const trial = submission.trial_name.toUpperCase()
      if (!best[trial] || time < best[trial].time) {
        best[trial] = { time, submissionUuid: submission.uuid }
      }
    }

    return Object.fromEntries(
      trialNames.map((trial) => {
        const bestResult = best[trial.toUpperCase()]
        return [
          trial.toUpperCase(),
          bestResult
            ? { time: bestResult.time.toFixed(3), submissionUuid: bestResult.submissionUuid }
            : { time: "0.000", submissionUuid: "" },
        ]
      })
    )
  }, [submissions])

  const rows = React.useMemo(
    () =>
      trialNames.map((trialName) => {
        const trial = trialName.toUpperCase()
        const bestResult = personalBestTimes[trial]
        const timeStr = bestResult.time
        const time = Number(timeStr)
        const wr = Number(
          worldRecords.find((record) => record.trial_name.toUpperCase() === trial)?.time || 0
        )

        return {
          trial: trialName,
          time: timeStr,
          submissionUuid: bestResult.submissionUuid,
          score:
            Number.isFinite(time) && time > 0 && Number.isFinite(wr) && wr > 0
              ? Number(calculateScore(wr, time, trialName).toFixed(3))
              : 0,
        }
      }),
    [personalBestTimes, worldRecords]
  )

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
        <div className="rounded-3xl border border-border bg-muted px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Player score</p>
          <p className="text-3xl font-semibold">{formatPlayerScore(player.score)}</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Approved Times</h2>
              <p className="text-sm text-muted-foreground">Showing up to the first 50 approved submissions.</p>
            </div>
            <Link href={`/calculator?player_uuid=${encodeURIComponent(player.uuid)}`} target="_blank" className="text-sm text-sky-600 underline">
              View in calculator
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trial</TableHead>
                  <TableHead>Best time</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.trial}>
                    <TableCell>{row.trial}</TableCell>
                    <TableCell>
                      {row.submissionUuid ? (
                        <Link
                          href={`/submissions/${encodeURIComponent(row.submissionUuid)}`}
                          target="_blank"
                          className="text-sky-600 underline underline-offset-4"
                        >
                          {row.time}
                        </Link>
                      ) : (
                        <span>{row.time}</span>
                      )}
                    </TableCell>
                    <TableCell>{row.score.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
