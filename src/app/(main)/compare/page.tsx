"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { apiV1 } from "@/lib/api"
import { PageHeader, PageShell } from "@/components/custom/page-shell"
import calculateScore from "@/lib/calc-score"
import { trials as trialNames, TrialName } from "@/lib/trials"
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

function timeIndicatorClass(time: number, otherTime: number) {
  if (!Number.isFinite(time) || time <= 0) {
    return "text-muted-foreground"
  }

  if (!Number.isFinite(otherTime) || otherTime <= 0) {
    return "text-foreground"
  }

  if (time === otherTime) {
    return "text-muted-foreground"
  }

  return time < otherTime ? "text-emerald-600 font-semibold" : "text-destructive"
}

function timeIndicatorDotClass(time: number, otherTime: number) {
  if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(otherTime) || otherTime <= 0 || time === otherTime) {
    return "bg-muted"
  }

  return time < otherTime ? "bg-emerald-600" : "bg-destructive"
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

type ListResponse<T> = {
  results?: T[]
  error?: string
}

function ComparePageClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [players, setPlayers] = React.useState<PlayerItem[]>([])
  const [worldRecords, setWorldRecords] = React.useState<WorldRecordValue[]>([])
  const [loadingPlayers, setLoadingPlayers] = React.useState(true)
  const [loadingTimes, setLoadingTimes] = React.useState(false)
  const [playerAUuid, setPlayerAUuid] = React.useState(() => searchParams.get("a") || "")
  const [playerBUuid, setPlayerBUuid] = React.useState(() => searchParams.get("b") || "")
  const [playerATimes, setPlayerATimes] = React.useState<Record<string, PlayerTrialTime>>(zeroTimes)
  const [playerBTimes, setPlayerBTimes] = React.useState<Record<string, PlayerTrialTime>>(zeroTimes)
  const [playerAName, setPlayerAName] = React.useState("")
  const [playerBName, setPlayerBName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (playerAUuid) {
      params.set("a", playerAUuid)
    } else {
      params.delete("a")
    }

    if (playerBUuid) {
      params.set("b", playerBUuid)
    } else {
      params.delete("b")
    }

    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname
    const currentQuery = searchParams.toString()
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false })
    }
  }, [pathname, playerAUuid, playerBUuid, router, searchParams])

  React.useEffect(() => {
    const loadPlayers = async () => {
      try {
        const response = await fetch(apiV1("/players"), { cache: "force-cache" })
        const json = (await response.json()) as ListResponse<PlayerItem>
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
        const response = await fetch(apiV1("/records/world"), { cache: "force-cache" })
        const json = (await response.json()) as ListResponse<WorldRecordValue>
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
          fetch(`${apiV1("/submissions")}?player_uuid=${encodeURIComponent(uuid)}&state=approved&page=1&limit=50`, {
            cache: "no-store",
          }).then(async (response) => {
            const json = (await response.json()) as ListResponse<SubmissionValue>
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
          wrTime,
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
    <PageShell className="lg:max-w-[95vw]">
      <PageHeader title="Compare Players" />

      <div className="space-y-2">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {!error && (loadingPlayers || loadingTimes) ? (
          <p className="text-xs text-muted-foreground">Loading comparison data.</p>
        ) : null}

        <div className="grid gap-2">
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2.5 backdrop-blur-xl supports-backdrop-filter:bg-background/45">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Players</p>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
                  <Select value={playerAUuid} onValueChange={setPlayerAUuid}>
                    <SelectTrigger className="h-8 w-full text-xs">
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

                  <Select value={playerBUuid} onValueChange={setPlayerBUuid}>
                    <SelectTrigger className="h-8 w-full text-xs">
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
            </div>
          </div>
        </div>

        {loadingPlayers || loadingTimes ? (
          <div className="flex items-center justify-center py-6 lg:py-2">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-full border-separate border-spacing-0">
                  <TableHeader>
                    <TableRow className="bg-muted/70">
                      <TableHead className="rounded-tl-xl px-2 py-1.5">Trial</TableHead>
                      <TableHead className="px-2 py-1.5">WR</TableHead>
                      <TableHead className="px-2 py-1.5">{playerAName || "Player A"}</TableHead>
                      <TableHead className="rounded-tr-xl px-2 py-1.5">{playerBName || "Player B"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.trial} className="bg-background">
                        <TableCell className="px-2 py-1 text-xs font-semibold leading-none uppercase">{row.trial}</TableCell>
                        <TableCell className="px-2 py-1 text-left text-xs font-medium text-sky-600">
                          {row.wrTime > 0 ? formatTime(row.wrTime) : "0.000"}
                        </TableCell>

                        <TableCell className="px-2 py-1">
                          <div className="text-xs">
                            {row.playerA.submissionUuid ? (
                              <Link
                                href={`/submissions/${encodeURIComponent(row.playerA.submissionUuid)}`}
                                className={`inline-flex items-center gap-2 ${timeIndicatorClass(
                                  Number(row.playerA.time),
                                  Number(row.playerB.time)
                                )} underline underline-offset-4`}
                              >
                                <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${timeIndicatorDotClass(
                                  Number(row.playerA.time),
                                  Number(row.playerB.time)
                                )}`} />
                                {row.playerA.time} <span className="text-muted-foreground">({row.playerA.score.toFixed(3)})</span>
                              </Link>
                            ) : (
                              <p className={`inline-flex items-center gap-2 text-xs ${timeIndicatorClass(
                                Number(row.playerA.time),
                                Number(row.playerB.time)
                              )}`}>
                                <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${timeIndicatorDotClass(
                                  Number(row.playerA.time),
                                  Number(row.playerB.time)
                                )}`} />
                                {row.playerA.time} <span className="text-muted-foreground">({row.playerA.score.toFixed(3)})</span>
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="px-2 py-1">
                          <div className="text-xs">
                            {row.playerB.submissionUuid ? (
                              <Link
                                href={`/submissions/${encodeURIComponent(row.playerB.submissionUuid)}`}
                                className={`inline-flex items-center gap-2 ${timeIndicatorClass(
                                  Number(row.playerB.time),
                                  Number(row.playerA.time)
                                )} underline underline-offset-4`}
                              >
                                <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${timeIndicatorDotClass(
                                  Number(row.playerB.time),
                                  Number(row.playerA.time)
                                )}`} />
                                {row.playerB.time} <span className="text-muted-foreground">({row.playerB.score.toFixed(3)})</span>
                              </Link>
                            ) : (
                              <p className={`inline-flex items-center gap-2 text-xs ${timeIndicatorClass(
                                Number(row.playerB.time),
                                Number(row.playerA.time)
                              )}`}>
                                <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${timeIndicatorDotClass(
                                  Number(row.playerB.time),
                                  Number(row.playerA.time)
                                )}`} />
                                {row.playerB.time} <span className="text-muted-foreground">({row.playerB.score.toFixed(3)})</span>
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PageShell>
  )
}

export default function ComparePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      }
    >
      <ComparePageClient />
    </React.Suspense>
  )
}
