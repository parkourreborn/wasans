"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { ErrorState, PageHeader, PageShell } from "@/components/custom/page-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
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
  discord_avatar?: string | null
  discord_discriminator?: string | null
  player_name: string
  score: number
}

type TrialPlayer = {
  player_uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
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
  playerAvatar?: string | null
  playerDiscriminator?: string | null
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
  const hasLoadedRowsRef = useRef(false)

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

  const populatedRows = rows.filter((row) => row.rank != null || row.overallScore != null || row.trialTime != null)

  useEffect(() => {
    const loadRows = async () => {
      if (!hasLoadedRowsRef.current) {
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
            playerAvatar: row.discord_avatar,
            playerDiscriminator: row.discord_discriminator,
            overallScore: Number(row.score),
            rank: index + 1,
          }))

          setRows(result)
          hasLoadedRowsRef.current = true
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
          playerAvatar: row.discord_avatar,
          playerDiscriminator: row.discord_discriminator,
          playerName: row.player_name,
          trialTime: row.time,
          trialScore: Number(row.score || 0),
          submissionUuid: row.submission_uuid,
          rank: row.rank ?? (row.time ? index + 1 : null),
        }))

        setRows(result)
        hasLoadedRowsRef.current = true
      } catch (err) {
        console.error(err)
        setError("We couldn't load players right now.")
      } finally {
        setLoading(false)
        setIsFetching(false)
      }
    }

    loadRows()
  }, [mode, trialName])

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="Players" />

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Skeleton className="h-9 w-36" />
                <Skeleton className="h-9 w-56" />
              </div>
              <Skeleton className="h-9 w-full lg:max-w-sm" />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-1 h-8 w-20" />
          </div>
        </div>

        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="overflow-hidden border-border/70 bg-card/80">
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-52" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <ErrorState
          title="Players unavailable"
          message={error}
          actions={
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="Players" />

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
                <TabsList>
                  <TabsTrigger className="cursor-pointer" value="overall">Overall</TabsTrigger>
                  <TabsTrigger className="cursor-pointer" value="trial">Trial</TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === "trial" ? (
                <div className="w-full sm:min-w-56 sm:max-w-56">
                  <Select value={trialName} onValueChange={(value) => setTrialName(value as TrialName)}>
                    <SelectTrigger className="h-9">
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
                </div>
              ) : null}
            </div>

            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search players"
              aria-label="Search players"
              className="h-9 w-full xl:max-w-sm"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {mode === "overall" ? "Overall board" : "Trial board"}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {mode === "overall" ? String(rows.length) : trialName}
          </p>
          <p className="text-xs text-muted-foreground">
            {mode === "overall" ? "Ranked players loaded" : `${populatedRows.length} visible rows`}
          </p>
        </div>
      </div>

      {isFetching ? (
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Updating results...
        </div>
      ) : null}

        {isFetching ? (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Updating results...
          </div>
        ) : null}

      {filteredRows.length === 0 ? (
        <div className="flex min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15">
          <p className="text-muted-foreground">No matching players.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <Card key={`${mode}-${row.playerUuid}`} className="overflow-hidden border-border/70 bg-card/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_24px_52px_-34px_rgba(0,0,0,0.85)]">
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <PlayerAvatar
                    playerName={row.playerName}
                    discordId={row.playerId}
                    discordAvatar={row.playerAvatar}
                    discordDiscriminator={row.playerDiscriminator}
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/players/${row.playerUuid}`}
                      className="text-base font-semibold underline underline-offset-4"
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
                  {mode === "trial" && row.submissionUuid ? (
                    <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                      <Link href={`/submissions/${encodeURIComponent(row.submissionUuid)}`}>
                        View Submission
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
    </PageShell>
  )
}
