"use client"

import * as React from "react"
import Link from "next/link"
import { apiV2 } from "@/lib/api"
import { SectionCard } from "@/components/custom/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type GiveawayStatus = "active" | "won" | "closed"

type GiveawayWinner = {
  uuid: string
  player_uuid: string
  player_name: string
  claimed: number
}

type Giveaway = {
  uuid: string
  title: string
  description: string | null
  max_winners: number
  ends_at: number
  status: GiveawayStatus
}

function jsonErrorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) {
      return error.message
    }
  }
  return fallback
}

function formatTimestamp(value: number) {
  return new Date(value * 1000).toLocaleString()
}

function datetimeLocalToUnixSeconds(value: string): number | null {
  if (!value) {
    return null
  }
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function GiveawaysSection() {
  const [giveaways, setGiveaways] = React.useState<Giveaway[]>([])
  const [winnersByGiveaway, setWinnersByGiveaway] = React.useState<Record<string, GiveawayWinner[]>>({})
  const [entryCounts, setEntryCounts] = React.useState<Record<string, number>>({})
  const [loading, setLoading] = React.useState(true)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [maxWinners, setMaxWinners] = React.useState("")
  const [endsAt, setEndsAt] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [busyUuid, setBusyUuid] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        fetch(apiV2("/giveaways?filter=active"), { cache: "no-store" }),
        fetch(apiV2("/giveaways?filter=history"), { cache: "no-store" }),
      ])
      const activeJson = (await activeResponse.json().catch(() => null)) as { data?: Giveaway[] } | null
      const historyJson = (await historyResponse.json().catch(() => null)) as { data?: Giveaway[] } | null
      if (!activeResponse.ok || !historyResponse.ok) {
        throw new Error(jsonErrorMessage(activeJson || historyJson, "Unable to load giveaways"))
      }
      const all = [...(activeJson?.data || []), ...(historyJson?.data || [])]
      setGiveaways(all)

      const details = await Promise.all(
        all.map(async (giveaway) => {
          const response = await fetch(apiV2(`/giveaways/${giveaway.uuid}`), { cache: "no-store" })
          const json = (await response.json().catch(() => null)) as {
            data?: { winners?: GiveawayWinner[]; entry_count?: number }
          } | null
          return [giveaway.uuid, json?.data?.winners || [], json?.data?.entry_count ?? 0] as const
        })
      )
      setWinnersByGiveaway(Object.fromEntries(details.map(([uuid, winners]) => [uuid, winners])))
      setEntryCounts(Object.fromEntries(details.map(([uuid, , count]) => [uuid, count])))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load giveaways")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const createGiveaway = async () => {
    const trimmedTitle = title.trim()
    const endsAtSeconds = datetimeLocalToUnixSeconds(endsAt)
    const maxWinnersNumber = Number(maxWinners)

    if (!trimmedTitle || !maxWinners.trim() || !Number.isFinite(maxWinnersNumber) || maxWinnersNumber < 1 || !endsAtSeconds) {
      toast.error("Title, a positive max winners, and a deadline are required")
      return
    }

    setCreating(true)
    try {
      const response = await fetch(apiV2("/giveaways"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || null,
          max_winners: maxWinnersNumber,
          ends_at: endsAtSeconds,
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to create giveaway"))
      }
      setTitle("")
      setDescription("")
      setMaxWinners("")
      setEndsAt("")
      toast.success("Giveaway created")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create giveaway")
    } finally {
      setCreating(false)
    }
  }

  const runAction = async (uuid: string, action: "close" | "draw" | "reroll", label: string) => {
    setBusyUuid(uuid)
    try {
      const response = await fetch(apiV2(`/giveaways/${uuid}/${action}`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, `Unable to ${label}`))
      }
      toast.success(`Giveaway ${label}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to ${label}`)
    } finally {
      setBusyUuid(null)
    }
  }

  const toggleClaimed = async (winnerUuid: string, claimed: boolean) => {
    setBusyUuid(winnerUuid)
    try {
      const response = await fetch(apiV2(`/giveaways/winners/${winnerUuid}/claim`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimed }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to update claim status"))
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update claim status")
    } finally {
      setBusyUuid(null)
    }
  }

  return (
    <SectionCard
      title="Giveaways"
      description="A raffle with a fixed winner count and deadline. Any logged-in player can join once; drawing and rerolling are manual."
    >
      <div className="space-y-3 rounded-lg border border-border p-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input type="number" placeholder="Max winners" value={maxWinners} onChange={(e) => setMaxWinners(e.target.value)} />
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} title="Deadline" />
          <Button type="button" onClick={createGiveaway} disabled={creating}>
            {creating ? <Spinner className="size-4" /> : null}
            Create giveaway
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading giveaways...
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {giveaways.map((giveaway) => {
            const winners = winnersByGiveaway[giveaway.uuid] || []
            const entryCount = entryCounts[giveaway.uuid] ?? 0
            return (
              <div key={giveaway.uuid} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{giveaway.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {entryCount} entrants · up to {giveaway.max_winners} winners · ends {formatTimestamp(giveaway.ends_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={giveaway.status === "active" ? "default" : giveaway.status === "won" ? "secondary" : "outline"}>
                      {giveaway.status}
                    </Badge>
                    {giveaway.status === "active" ? (
                      <Button type="button" size="sm" disabled={busyUuid === giveaway.uuid} onClick={() => runAction(giveaway.uuid, "draw", "drawn")}>
                        Draw
                      </Button>
                    ) : null}
                    {giveaway.status === "won" ? (
                      <Button type="button" variant="outline" size="sm" disabled={busyUuid === giveaway.uuid} onClick={() => runAction(giveaway.uuid, "reroll", "rerolled")}>
                        Reroll
                      </Button>
                    ) : null}
                    {giveaway.status !== "closed" ? (
                      <Button type="button" variant="outline" size="sm" disabled={busyUuid === giveaway.uuid} onClick={() => runAction(giveaway.uuid, "close", "closed")}>
                        Close
                      </Button>
                    ) : null}
                  </div>
                </div>

                {winners.length > 0 ? (
                  <div className="space-y-1">
                    {winners.map((winner) => (
                      <div key={winner.uuid} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1 text-sm">
                        <Link href={`/players/${winner.player_uuid}`} className="underline underline-offset-2">
                          {winner.player_name}
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busyUuid === winner.uuid}
                          onClick={() => toggleClaimed(winner.uuid, winner.claimed !== 1)}
                        >
                          {winner.claimed ? "Claimed" : "Mark claimed"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          {giveaways.length === 0 ? <p className="text-sm text-muted-foreground">No giveaways yet.</p> : null}
        </div>
      )}
    </SectionCard>
  )
}
