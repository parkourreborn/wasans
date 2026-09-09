"use client"

import * as React from "react"
import Link from "next/link"
import { apiV2 } from "@/lib/api"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { ErrorState, PageHeader, PageShell, SectionCard } from "@/components/custom/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

type PrizeStatus = "active" | "won" | "closed"

type PrizeWinner = { uuid: string; player_uuid: string; player_name: string; claimed: number }
type Prize = {
  uuid: string
  title: string
  description: string | null
  criteria_type: "trial_wr" | "combo_wr" | "rankup" | "score_reached"
  criteria_trial_name: string | null
  criteria_combo_category_slug: string | null
  criteria_score_target: number | null
  max_winners: number | null
  ends_at: number | null
  status: PrizeStatus
  created_at: number
}
type PrizeWithWinners = Prize & { winners: PrizeWinner[] }
type PrizesResponse = { data?: Prize[] }
type PrizeDetailResponse = { data?: { prize: Prize; winners: PrizeWinner[] } }

type GiveawayWinner = { uuid: string; player_uuid: string; player_name: string; claimed: number }
type Giveaway = {
  uuid: string
  title: string
  description: string | null
  max_winners: number
  ends_at: number
  status: PrizeStatus
  created_at: number
}
type GiveawayWithDetails = Giveaway & { winners: GiveawayWinner[]; entry_count: number; viewer_has_joined: boolean }
type GiveawaysResponse = { data?: Giveaway[] }
type GiveawayDetailResponse = { data?: { giveaway: Giveaway; winners: GiveawayWinner[]; entry_count: number; viewer_has_joined: boolean } }

// Mirrors the "unseen error" badge on /logs (see app-sidebar.tsx): the
// sidebar polls the same active prizes/giveaways endpoints to decide whether
// to show the dot, and this key is what marks them as seen once visited.
const lastSeenPrizeStorageKey = "wasans:last-seen-prize-at"

function jsonErrorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) {
      return error.message
    }
  }
  return fallback
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return "No deadline"
  }
  return new Date(value * 1000).toLocaleString()
}

const criteriaLabels: Record<Prize["criteria_type"], string> = {
  trial_wr: "New trial WR",
  combo_wr: "New combo WR",
  rankup: "Rank up",
  score_reached: "Score reached",
}

function criteriaDescription(prize: Prize) {
  switch (prize.criteria_type) {
    case "trial_wr":
      return prize.criteria_trial_name ? `New WR on ${prize.criteria_trial_name}` : "New WR on any trial"
    case "combo_wr":
      return prize.criteria_combo_category_slug ? `New #1 in ${prize.criteria_combo_category_slug}` : "New #1 in any combo category"
    case "rankup":
      return "Reaching a new rank"
    case "score_reached":
      return prize.criteria_score_target != null ? `Score reaches ${prize.criteria_score_target}` : "Score reached"
    default:
      return criteriaLabels[prize.criteria_type]
  }
}

function statusBadgeVariant(status: PrizeStatus): "default" | "secondary" | "outline" {
  if (status === "active") return "default"
  if (status === "won") return "secondary"
  return "outline"
}

function WinnerList({ winners }: { winners: Array<{ uuid: string; player_uuid: string; player_name: string; claimed: number }> }) {
  if (winners.length === 0) {
    return <p className="text-sm text-muted-foreground">No winners yet.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {winners.map((winner) => (
        <Link key={winner.uuid} href={`/players/${winner.player_uuid}`}>
          <Badge variant={winner.claimed ? "secondary" : "default"} className="cursor-pointer">
            {winner.player_name}
            {winner.claimed ? " · claimed" : ""}
          </Badge>
        </Link>
      ))}
    </div>
  )
}

export default function PrizesPage() {
  const { status } = useAuthSession()
  const [filter, setFilter] = React.useState<"active" | "history">("active")
  const [prizes, setPrizes] = React.useState<PrizeWithWinners[]>([])
  const [giveaways, setGiveaways] = React.useState<GiveawayWithDetails[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [signInDialogOpen, setSignInDialogOpen] = React.useState(false)
  const [joiningUuid, setJoiningUuid] = React.useState<string | null>(null)

  const load = React.useCallback(async (nextFilter: "active" | "history") => {
    setLoading(true)
    setError(null)
    try {
      const [prizesResponse, giveawaysResponse] = await Promise.all([
        fetch(apiV2(`/prizes?filter=${nextFilter}`), { cache: "no-store" }),
        fetch(apiV2(`/giveaways?filter=${nextFilter}`), { cache: "no-store" }),
      ])

      const prizesJson = (await prizesResponse.json().catch(() => null)) as PrizesResponse | null
      if (!prizesResponse.ok) {
        throw new Error(jsonErrorMessage(prizesJson, "Unable to load prizes"))
      }
      const giveawaysJson = (await giveawaysResponse.json().catch(() => null)) as GiveawaysResponse | null
      if (!giveawaysResponse.ok) {
        throw new Error(jsonErrorMessage(giveawaysJson, "Unable to load giveaways"))
      }

      const prizeList = prizesJson?.data || []
      const giveawayList = giveawaysJson?.data || []

      // Only active prizes/giveaways count toward "seen" -- history is past
      // activity nobody needs a badge nudge to go look at.
      if (nextFilter === "active") {
        const createdTimestamps = [...prizeList, ...giveawayList].map((item) => item.created_at)
        if (createdTimestamps.length > 0) {
          window.localStorage.setItem(lastSeenPrizeStorageKey, String(Math.max(...createdTimestamps)))
          window.dispatchEvent(new CustomEvent("wasans:last-seen-prize-updated"))
        }
      }

      const [prizeDetails, giveawayDetails] = await Promise.all([
        Promise.all(
          prizeList.map(async (prize) => {
            const response = await fetch(apiV2(`/prizes/${prize.uuid}`), { cache: "no-store" })
            const json = (await response.json().catch(() => null)) as PrizeDetailResponse | null
            return { ...prize, winners: json?.data?.winners || [] }
          })
        ),
        Promise.all(
          giveawayList.map(async (giveaway) => {
            const response = await fetch(apiV2(`/giveaways/${giveaway.uuid}`), { cache: "no-store" })
            const json = (await response.json().catch(() => null)) as GiveawayDetailResponse | null
            return {
              ...giveaway,
              winners: json?.data?.winners || [],
              entry_count: json?.data?.entry_count ?? 0,
              viewer_has_joined: json?.data?.viewer_has_joined ?? false,
            }
          })
        ),
      ])

      setPrizes(prizeDetails)
      setGiveaways(giveawayDetails)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load prizes and giveaways")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(filter)
  }, [filter, load])

  const joinGiveaway = async (giveawayUuid: string) => {
    if (status !== "authenticated") {
      setSignInDialogOpen(true)
      return
    }

    setJoiningUuid(giveawayUuid)
    try {
      const response = await fetch(apiV2(`/giveaways/${giveawayUuid}/join`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to join giveaway"))
      }
      toast.success("You've joined the giveaway")
      setGiveaways((prev) =>
        prev.map((g) => (g.uuid === giveawayUuid ? { ...g, viewer_has_joined: true, entry_count: g.entry_count + 1 } : g))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to join giveaway")
    } finally {
      setJoiningUuid(null)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Prizes" description="Rewards for hitting records or ranks, and community giveaways." />

      <div className="sticky top-14 z-30 rounded-lg border border-border bg-background p-4 md:top-0">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as "active" | "history")}>
          <TabsList>
            <TabsTrigger className="cursor-pointer" value="active">Active</TabsTrigger>
            <TabsTrigger className="cursor-pointer" value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <AlertDialog open={signInDialogOpen} onOpenChange={setSignInDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign in with Discord</AlertDialogTitle>
            <AlertDialogDescription>
              You need to log in before joining a giveaway. By logging in, you agree to{" "}
              <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a href={apiV2("/auth/discord/start")} className="inline-flex w-full items-center justify-center">
                Login with Discord
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <SectionCard title="Prizes">
            {prizes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {filter === "active" ? "No active prizes right now." : "No prize history yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {prizes.map((prize) => (
                  <Card key={prize.uuid}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">{prize.title}</p>
                          <p className="text-sm text-muted-foreground">{criteriaDescription(prize)}</p>
                        </div>
                        <Badge variant={statusBadgeVariant(prize.status)}>{prize.status}</Badge>
                      </div>
                      {prize.description ? <p className="text-sm">{prize.description}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        {prize.max_winners ? `${prize.winners.length}/${prize.max_winners} winners` : `${prize.winners.length} winners (unlimited)`}
                        {" · "}
                        {prize.ends_at ? formatTimestamp(prize.ends_at) : "No deadline"}
                      </p>
                      <WinnerList winners={prize.winners} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Giveaways">
            {giveaways.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {filter === "active" ? "No active giveaways right now." : "No giveaway history yet."}
              </p>
            ) : (
              <div className="space-y-3">
                {giveaways.map((giveaway) => (
                  <Card key={giveaway.uuid}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">{giveaway.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {giveaway.entry_count} {giveaway.entry_count === 1 ? "entrant" : "entrants"} · up to {giveaway.max_winners} winners
                          </p>
                        </div>
                        <Badge variant={statusBadgeVariant(giveaway.status)}>{giveaway.status}</Badge>
                      </div>
                      {giveaway.description ? <p className="text-sm">{giveaway.description}</p> : null}
                      <p className="text-xs text-muted-foreground">Ends {formatTimestamp(giveaway.ends_at)}</p>
                      <WinnerList winners={giveaway.winners} />
                      {giveaway.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={giveaway.viewer_has_joined || joiningUuid === giveaway.uuid}
                          onClick={() => joinGiveaway(giveaway.uuid)}
                        >
                          {giveaway.viewer_has_joined ? "Joined" : "Join"}
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageShell>
  )
}
