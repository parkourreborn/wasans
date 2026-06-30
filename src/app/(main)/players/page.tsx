"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type Player = {
  uuid: string
  player_name: string
  score: number
}

type PlayersResponse = {
  results: Player[]
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return players.filter((player) => {
      return (
        !normalizedQuery ||
        player.player_name.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [searchQuery, players])

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(apiV1("/players"), { cache: "no-store" })

        if (!response.ok) {
          throw new Error("Failed to load players")
        }

        const data = await response.json() as PlayersResponse
        setPlayers(data.results || [])
      } catch (err) {
        console.error(err)
        setError("Unable to load players")
      } finally {
        setLoading(false)
      }
    }

    fetchPlayers()
  }, [])

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
            {filteredPlayers.map((player) => (
              <Card key={player.uuid} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/players/${player.uuid}`}
                      className="text-lg font-semibold underline underline-offset-4"
                    >
                      {player.player_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Score {player.score.toFixed(3)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <Link href={`/submissions?player_uuid=${player.uuid}`}>
                      View Submissions
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}