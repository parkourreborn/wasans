"use client"

import * as React from "react"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { trials as trialNames } from "@/lib/trials"
import { formatPlayerScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"

function formatDateJoined(value: string) {
  const unix = Number(value)
  if (!Number.isFinite(unix)) {
    return value
  }

  const date = new Date(unix * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const year = date.getFullYear()
  return `${month}-${day}-${year}`
}

type OverallRow = {
  player_uuid: string
  player_name: string
  overall_score: number
  date_joined: string
}

type TrialRow = {
  player_uuid: string
  player_name: string
  time: number | null
  submission_uuid: string | null
  score: number
  is_world_record: boolean
  wr_submission_uuid: string | null
}

export default function LeaderboardPage() {
  const [mode, setMode] = React.useState("overall")
  const [trialName, setTrialName] = React.useState("")
  const [rows, setRows] = React.useState<(OverallRow | TrialRow)[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const endpoint =
          mode === "trial" && trialName
            ? apiV1(`/leaderboards/trials/${encodeURIComponent(trialName)}`)
            : apiV1("/leaderboards/overall")
        const response = await fetch(`${endpoint}?page=1&limit=500`, { cache: "no-store" })
        const json = (await response.json()) as {
          results?: (OverallRow | TrialRow)[]
          error?: string
        }
        if (!response.ok) {
          throw new Error(json.error || "Unable to load leaderboard")
        }
        setRows(json.results || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load leaderboard")
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [mode, trialName])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">View the ranked player list by overall score or by trial.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-semibold">Leaderboard mode</p>
            <Select value={mode} onValueChange={(value) => setMode(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "trial" && (
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-semibold">Select trial</p>
              <Select value={trialName} onValueChange={(value) => setTrialName(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose trial" />
                </SelectTrigger>
                <SelectContent>
                  {trialNames.map((trial) => (
                    <SelectItem key={trial} value={trial}>
                      {trial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>{mode === "trial" ? "Time" : "Score"}</TableHead>
                  <TableHead>{mode === "trial" ? "Run score" : "Joined"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.player_uuid}>
                    <TableCell>{mode === "trial" ? (row as TrialRow).time ? index + 1 : "—" : index + 1}</TableCell>
                    <TableCell>
                      <Link href={`/players/${row.player_uuid}`} className="underline underline-offset-4">
                        {row.player_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {mode === "trial" ? (
                        (row as TrialRow).time ? (
                          (() => {
                            const submissionUuid = (row as TrialRow).submission_uuid
                            const displayTime = Number((row as TrialRow).time).toFixed(3)
                            return submissionUuid ? (
                              <Link
                                href={`/submissions/${encodeURIComponent(submissionUuid)}`}
                                className="text-sky-600 underline underline-offset-4"
                              >
                                {displayTime}
                              </Link>
                            ) : (
                              displayTime
                            )
                          })()
                        ) : (
                          "—"
                        )
                      ) : (
                        Number((row as OverallRow).overall_score).toFixed(3)
                      )}
                    </TableCell>
                    <TableCell>
                      {mode === "trial" ? Number((row as TrialRow).score).toFixed(3) : formatDateJoined((row as OverallRow).date_joined)}
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
