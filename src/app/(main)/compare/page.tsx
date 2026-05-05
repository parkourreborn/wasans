"use client"

import * as React from "react"
import Link from "next/link"
import calculateScore from "@/lib/calc-score"
import { trials as trialNames, TrialName } from "@/lib/trials"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"

type WorldRecordValue = {
  trial_name: string
  time: number
}

const scoreFor = (wr: number, your_time: number, trial: TrialName) => {
  if (your_time < wr) return 0
  return Number(calculateScore(wr, your_time, trial).toFixed(3))
}

type PlayerTime = {
  time: string
  submissionUuid: string
}

const zeroTimes: Record<string, PlayerTime> = Object.fromEntries(
  trialNames.map((trial) => [trial.toUpperCase(), { time: "0.000", submissionUuid: "" }])
)

function formatTime(rawTime: number | string) {
  const timeStr = String(rawTime)
  const match = timeStr.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return timeStr
  }

  const [, seconds, ms] = match
  return `${String(Number(seconds))}.${ms.padEnd(3, "0")}`
}

function formatPlayerTimes(submissions: Array<{ uuid: string; trial_name: string; time: number | string }>) {
  const bestTimes: Record<string, { time: number; submissionUuid: string }> = {}
  for (const submission of submissions) {
    const trial = submission.trial_name.toUpperCase()
    const time = Number(submission.time)
    if (!Number.isFinite(time) || time <= 0) {
      continue
    }
    if (!bestTimes[trial] || time < bestTimes[trial].time) {
      bestTimes[trial] = { time, submissionUuid: submission.uuid }
    }
  }
  return {
    ...zeroTimes,
    ...Object.fromEntries(
      Object.entries(bestTimes).map(([trial, best]) => [trial, { time: best.time.toFixed(3), submissionUuid: best.submissionUuid }])
    ),
  }
}

type PlayerItem = {
  uuid: string
  player_name: string
  score: number
}

type SubmissionValue = {
  uuid: string
  trial_name: string
  time: number | string
  state: string
}

type PlayerTrialTime = {
  time: string
  submissionUuid: string
}

export default function ComparePage() {
  const [players, setPlayers] = React.useState<PlayerItem[]>([])
  const [worldRecords, setWorldRecords] = React.useState<WorldRecordValue[]>([])
  const [loadingPlayers, setLoadingPlayers] = React.useState(true)
  const [loadingTimes, setLoadingTimes] = React.useState(false)
  const [playerAUuid, setPlayerAUuid] = React.useState("")
  const [playerBUuid, setPlayerBUuid] = React.useState("")
  const [playerATimes, setPlayerATimes] = React.useState<Record<string, PlayerTrialTime>>(zeroTimes)
  const [playerBTimes, setPlayerBTimes] = React.useState<Record<string, PlayerTrialTime>>(zeroTimes)
  const [playerAName, setPlayerAName] = React.useState("")
  const [playerBName, setPlayerBName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const loadPlayers = async () => {
      try {
        const response = await fetch("/api/players", { cache: "force-cache" })
        const json = await response.json()
        if (!response.ok) {
          throw new Error(json.error || "Unable to load players")
        }
        setPlayers(json.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load players")
      } finally {
        setLoadingPlayers(false)
      }
    }

    const loadWorldRecords = async () => {
      try {
        const response = await fetch("/api/wrs", { cache: "force-cache" })
        const json = await response.json()
        if (!response.ok) {
          throw new Error(json.error || "Unable to load WRs")
        }
        setWorldRecords(json.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load WRs")
      }
    }

    loadPlayers()
    loadWorldRecords()
  }, [])

  React.useEffect(() => {
    const loadPlayerTimes = async () => {
      if (!playerAUuid && !playerBUuid) {
        return
      }

      setLoadingTimes(true)
      setError(null)

      try {
        const requests = [playerAUuid, playerBUuid].filter(Boolean).map((uuid) =>
          fetch(`/api/submissions/player/${encodeURIComponent(uuid)}?approvedOnly=true&page=1&limit=50`, {
            cache: "no-store",
          }).then(async (response) => {
            const json = await response.json()
            if (!response.ok) {
              throw new Error(json.error || "Unable to load player submissions")
            }
            return { uuid, results: json.results || [] }
          })
        )

        const responses = await Promise.all(requests)
        for (const response of responses) {
          const times = formatPlayerTimes(response.results)
          const player = players.find((item) => item.uuid === response.uuid)
          if (response.uuid === playerAUuid) {
            setPlayerATimes(times)
            setPlayerAName(player?.player_name || "Player A")
          }
          if (response.uuid === playerBUuid) {
            setPlayerBTimes(times)
            setPlayerBName(player?.player_name || "Player B")
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load player submissions")
      } finally {
        setLoadingTimes(false)
      }
    }

    loadPlayerTimes()
  }, [playerAUuid, playerBUuid, players])

  const rows = React.useMemo(
    () =>
      trialNames.map((trialName) => {
        const trial = trialName.toUpperCase()
        const aTime = Number(playerATimes[trial].time)
        const bTime = Number(playerBTimes[trial].time)
        const wr = worldRecords.find((record) => record.trial_name.toUpperCase() === trial)
        const wrTime = wr?.time ?? 0
        return {
          trial: trialName,
          playerA: {
            time: playerATimes[trial].time,
            submissionUuid: playerATimes[trial].submissionUuid,
            score:
              Number.isFinite(aTime) && aTime > 0 && wrTime > 0
                ? scoreFor(wrTime, aTime, trialName)
                : 0,
          },
          playerB: {
            time: playerBTimes[trial].time,
            submissionUuid: playerBTimes[trial].submissionUuid,
            score:
              Number.isFinite(bTime) && bTime > 0 && wrTime > 0
                ? scoreFor(wrTime, bTime, trialName)
                : 0,
          },
        }
      }),
    [playerATimes, playerBTimes, worldRecords]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compare Players</h1>
          <p className="text-sm text-muted-foreground">Select two players and compare their approved times side by side.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-semibold">Player A</p>
          <Select value={playerAUuid} onValueChange={setPlayerAUuid}>
            <SelectTrigger>
              <SelectValue placeholder="Select player A" />
            </SelectTrigger>
            <SelectContent>
              {players.map((player) => (
                <SelectItem key={player.uuid} value={player.uuid}>
                  {player.player_name} ({player.score.toFixed(3)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-semibold">Player B</p>
          <Select value={playerBUuid} onValueChange={setPlayerBUuid}>
            <SelectTrigger>
              <SelectValue placeholder="Select player B" />
            </SelectTrigger>
            <SelectContent>
              {players.map((player) => (
                <SelectItem key={player.uuid} value={player.uuid}>
                  {player.player_name} ({player.score.toFixed(3)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loadingPlayers || loadingTimes ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trial</TableHead>
                  <TableHead>{playerAName || "Player A"}</TableHead>
                  <TableHead>{playerBName || "Player B"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.trial}>
                    <TableCell>{row.trial}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {row.playerA.submissionUuid ? (
                          <Link
                            href={`/submissions/${encodeURIComponent(row.playerA.submissionUuid)}`}
                            target="_blank"
                            className="text-sky-600 underline underline-offset-4"
                          >
                            {row.playerA.time}
                          </Link>
                        ) : (
                          <p>{row.playerA.time}</p>
                        )}
                        <p className="text-sm text-muted-foreground">Score {row.playerA.score.toFixed(3)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {row.playerB.submissionUuid ? (
                          <Link
                            href={`/submissions/${encodeURIComponent(row.playerB.submissionUuid)}`}
                            target="_blank"
                            className="text-sky-600 underline underline-offset-4"
                          >
                            {row.playerB.time}
                          </Link>
                        ) : (
                          <p>{row.playerB.time}</p>
                        )}
                        <p className="text-sm text-muted-foreground">Score {row.playerB.score.toFixed(3)}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
