"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type Player = {
  uuid: string
  player_id: string
  player_name: string
  score: number
}

type PlayersResponse = {
  results?: Player[]
  count?: number
  page?: number
  limit?: number
  error?: string
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)

  const trimmedSearch = searchQuery.trim()
  const hasMore = players.length < totalCount

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = trimmedSearch.toLowerCase()

    return players.filter((player) => {
      return (
        !normalizedQuery ||
        player.player_name.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [trimmedSearch, players])

  const loadPlayersPage = async (nextPage: number, append: boolean) => {
    const limit = 100
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(limit),
    })

    if (trimmedSearch) {
      params.set("search", trimmedSearch)
    }

    const response = await fetch(`${apiV1("/players")}?${params.toString()}`, { cache: "no-store" })
    const data = (await response.json()) as PlayersResponse

    if (!response.ok) {
      throw new Error(data.error || "Failed to load players")
    }

    const nextResults = data.results || []
    setPlayers((current) => (append ? [...current, ...nextResults] : nextResults))
    setTotalCount(Number(data.count || nextResults.length))
    setPage(nextPage)
  }

  useEffect(() => {
    const loadInitialPlayers = async () => {
      setLoading(true)
      setError(null)

      try {
        await loadPlayersPage(1, false)
      } catch (err) {
        console.error(err)
        setError("Unable to load players")
      } finally {
        setLoading(false)
      }
    }

    loadInitialPlayers()
  }, [trimmedSearch])

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) {
      return
    }

    setLoadingMore(true)
    try {
      await loadPlayersPage(page + 1, true)
    } catch (err) {
      console.error(err)
      setError("Unable to load more players")
    } finally {
      setLoadingMore(false)
    }
  }

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

        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search players by username"
            aria-label="Search players by username"
            className="h-10 flex-1"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredPlayers.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">
              {players.length === 0 ? "No players available" : "No matching players"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPlayers.map((player, index) => (
              <Card key={player.uuid} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar playerName={player.player_name} discordId={player.player_id} />
                      <div className="min-w-0">
                        <Link
                          href={`/players/${player.uuid}`}
                          className="text-lg font-semibold underline underline-offset-4"
                        >
                          {player.player_name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          #{index + 1} · Score {player.score.toFixed(3)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/calculator?player_uuid=${encodeURIComponent(player.uuid)}`}>
                          View in Calculator
                        </Link>
                      </Button>
                      <Button variant="default" size="sm" asChild>
                        <Link href={`/players/${player.uuid}`}>
                          View Profile
                        </Link>
                      </Button>
                    </div>
                </CardContent>
              </Card>
            ))}

              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button onClick={handleLoadMore} variant="outline" disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Spinner className="size-4" />
                        Loading
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              ) : null}
          </div>
        )}
      </div>
    </div>
  )
}