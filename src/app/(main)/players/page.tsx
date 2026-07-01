"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { trials } from "@/lib/trials"
import { TrialName } from "@/lib/trials"

type OverallPlayer = {
  uuid: string
  player_id: string
  player_name: string
  score: number
}

type TrialPlayer = {
  player_uuid: string
  player_id: string
  player_name: string
  time: number | null
  submission_uuid: string | null
  score: number
  rank: number | null
}

type PlayersResponse = {
  results?: OverallPlayer[]
  count?: number
  error?: string
}

type TrialLeaderboardResponse = {
  results?: TrialPlayer[]
  total?: number
  error?: string
}

type Mode = "overall" | "trial"

type DisplayRow = {
  playerUuid: string
  playerName: string
  playerId?: string
  overallScore?: number
  trialTime?: number | null
  trialScore?: number
  submissionUuid?: string | null
  rank: number | null
}

export default function PlayersPage() {
  const [mode, setMode] = useState<Mode>("overall")
  const [trialName, setTrialName] = useState<TrialName>(trials[0])
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }

    return rows.filter((row) => {
      return (
        row.playerName.toLowerCase().includes(query)
        || String(row.rank || "").includes(query)
        || String(row.overallScore ?? "").includes(query)
        || String(row.trialTime ?? "").includes(query)
      )
    })
  }, [rows, searchQuery])

  useEffect(() => {
    const loadRows = async () => {
      if (rows.length === 0) {
        setLoading(true)
      } else {
        setIsFetching(true)
      }
      setError(null)

      try {
        if (mode === "overall") {
          const response = await fetch(`${apiV1("/players")}?page=1&limit=500`, { cache: "no-store" })
          const json = (await response.json()) as PlayersResponse

          if (!response.ok) {
            throw new Error(json.error || "Unable to load players")
          }

          const result = (json.results || []).map((row, index) => ({
            playerUuid: row.uuid,
            playerName: row.player_name,
            playerId: row.player_id,
            overallScore: Number(row.score),
            rank: index + 1,
          }))

          setRows(result)
          return
        }

        const response = await fetch(`${apiV1(`/leaderboards/trials/${encodeURIComponent(trialName)}`)}?page=1&limit=500`, {
          cache: "no-store",
        })
        const json = (await response.json()) as TrialLeaderboardResponse

        if (!response.ok) {
          throw new Error(json.error || "Unable to load trial leaderboard")
        }

        const result = (json.results || []).map((row, index) => ({
          playerUuid: row.player_uuid,
          playerId: row.player_id,
          playerName: row.player_name,
          trialTime: row.time,
          trialScore: Number(row.score || 0),
          submissionUuid: row.submission_uuid,
          rank: row.rank ?? (row.time ? index + 1 : null),
        }))

        setRows(result)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "Unable to load players")
      } finally {
        setLoading(false)
        setIsFetching(false)
      }
    }

    loadRows()
  }, [mode, trialName])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold">Players</h1>

        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <div className={mode === "trial" ? "w-full lg:w-56" : "hidden lg:block lg:w-56"}>
            {mode === "trial" ? (
              <Select value={trialName} onValueChange={(value) => setTrialName(value as TrialName)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose trial" />
                </SelectTrigger>
                <SelectContent>
                  {trials.map((trial) => (
                    <SelectItem key={trial} value={trial}>
                      {trial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger className="cursor-pointer" value="overall">Overall</TabsTrigger>
              <TabsTrigger className="cursor-pointer" value="trial">Specific Trial</TabsTrigger>
            </TabsList>
          </Tabs>

          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search players"
            aria-label="Search players"
            className="h-10 w-full lg:max-w-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isFetching ? (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Updating results...
          </div>
        ) : null}

        {filteredRows.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">No matching players.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <Card key={`${mode}-${row.playerUuid}`} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar playerName={row.playerName} discordId={row.playerId} />
                    <div className="min-w-0">
                      <Link
                        href={`/players/${row.playerUuid}`}
                        className="text-lg font-semibold underline underline-offset-4"
                      >
                        {row.playerName}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        #{row.rank ?? "—"} · {mode === "overall"
                          ? `Score ${(row.overallScore || 0).toFixed(3)}`
                          : row.trialTime != null
                            ? `Time ${Number(row.trialTime).toFixed(3)} · Run score ${(row.trialScore || 0).toFixed(3)}`
                            : "No submission"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                      <Link href={`/calculator?player_uuid=${encodeURIComponent(row.playerUuid)}`}>
                        View in Calculator
                      </Link>
                    </Button>
                    {mode === "trial" && row.submissionUuid ? (
                      <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                        <Link href={`/submissions/${encodeURIComponent(row.submissionUuid)}`}>
                          View Trial Run
                        </Link>
                      </Button>
                    ) : null}
                    <Button variant="default" size="sm" className="cursor-pointer" asChild>
                      <Link href={`/players/${row.playerUuid}`}>
                        View Profile
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
