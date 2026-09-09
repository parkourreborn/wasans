"use client"

import * as React from "react"
import Link from "next/link"
import { apiV2 } from "@/lib/api"
import { SectionCard } from "@/components/custom/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { CheckIcon, XIcon } from "lucide-react"

type PrizeCriteriaType = "trial_wr" | "combo_wr" | "rankup" | "score_reached"
type PrizeStatus = "active" | "won" | "closed"

type PrizeWinner = {
  uuid: string
  player_uuid: string
  player_name: string
  claimed: number
  source: "auto" | "manual"
}

type Prize = {
  uuid: string
  title: string
  description: string | null
  criteria_type: PrizeCriteriaType
  criteria_trial_name: string | null
  criteria_combo_category_slug: string | null
  criteria_score_target: number | null
  max_winners: number | null
  ends_at: number | null
  status: PrizeStatus
}

type PrizeCandidate = {
  uuid: string
  prize_uuid: string
  player_uuid: string
  player_name: string
  detected_at: number
  event_details: string | null
}

type TrialOption = { name: string; status: "active" | "removed" }
type ComboCategoryOption = { slug: string; label: string; status: "active" | "disabled" }
type PlayerOption = { uuid: string; player_name: string }

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
    return "—"
  }
  return new Date(value * 1000).toLocaleString()
}

function datetimeLocalToUnixSeconds(value: string): number | null {
  if (!value) {
    return null
  }
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

const criteriaLabels: Record<PrizeCriteriaType, string> = {
  trial_wr: "New trial WR",
  combo_wr: "New combo WR",
  rankup: "Rank up",
  score_reached: "Score reached",
}

// Debounced name search against the public /v2/players?search= endpoint
// (same one the "Player permissions" section above uses), collapsing to a
// small chip once a result is picked so the surrounding prize card stays
// compact.
function PlayerSearchInput({
  selected,
  onSelect,
  onClear,
}: {
  selected: PlayerOption | null
  onSelect: (player: PlayerOption) => void
  onClear: () => void
}) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<PlayerOption[]>([])
  const [searching, setSearching] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`${apiV2("/players")}?search=${encodeURIComponent(trimmed)}&limit=8`, { cache: "no-store" })
        const json = (await response.json().catch(() => null)) as { data?: PlayerOption[] } | null
        setResults(response.ok ? json?.data || [] : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [query])

  if (selected) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm">
        <span className="font-medium">{selected.player_name}</span>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClear} aria-label="Clear selected player">
          <XIcon className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex-1">
      <Input
        placeholder="Search player by name"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a result (which blurs the input first) still
        // registers before the dropdown closes.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim() ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover shadow-md">
          {searching ? (
            <div className="p-2 text-xs text-muted-foreground">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">No players found.</div>
          ) : (
            results.map((player) => (
              <button
                key={player.uuid}
                type="button"
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(player)
                  setQuery("")
                  setResults([])
                  setOpen(false)
                }}
              >
                {player.player_name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function PrizesSection() {
  const [prizes, setPrizes] = React.useState<Prize[]>([])
  const [winnersByPrize, setWinnersByPrize] = React.useState<Record<string, PrizeWinner[]>>({})
  const [loading, setLoading] = React.useState(true)
  const [candidates, setCandidates] = React.useState<PrizeCandidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = React.useState(true)
  const [trials, setTrials] = React.useState<TrialOption[]>([])
  const [categories, setCategories] = React.useState<ComboCategoryOption[]>([])

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [criteriaType, setCriteriaType] = React.useState<PrizeCriteriaType>("trial_wr")
  const [criteriaTrialName, setCriteriaTrialName] = React.useState("")
  const [criteriaComboCategorySlug, setCriteriaComboCategorySlug] = React.useState("")
  const [criteriaTargetRoleId, setCriteriaTargetRoleId] = React.useState("")
  const [criteriaScoreTarget, setCriteriaScoreTarget] = React.useState("")
  const [maxWinners, setMaxWinners] = React.useState("")
  const [endsAt, setEndsAt] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const [addWinnerSelected, setAddWinnerSelected] = React.useState<Record<string, PlayerOption | null>>({})
  const [busyUuid, setBusyUuid] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        fetch(apiV2("/prizes?filter=active"), { cache: "no-store" }),
        fetch(apiV2("/prizes?filter=history"), { cache: "no-store" }),
      ])
      const activeJson = (await activeResponse.json().catch(() => null)) as { data?: Prize[] } | null
      const historyJson = (await historyResponse.json().catch(() => null)) as { data?: Prize[] } | null
      if (!activeResponse.ok || !historyResponse.ok) {
        throw new Error(jsonErrorMessage(activeJson || historyJson, "Unable to load prizes"))
      }
      const allPrizes = [...(activeJson?.data || []), ...(historyJson?.data || [])]
      setPrizes(allPrizes)

      const winnerEntries = await Promise.all(
        allPrizes.map(async (prize) => {
          const response = await fetch(apiV2(`/prizes/${prize.uuid}`), { cache: "no-store" })
          const json = (await response.json().catch(() => null)) as { data?: { winners?: PrizeWinner[] } } | null
          return [prize.uuid, json?.data?.winners || []] as const
        })
      )
      setWinnersByPrize(Object.fromEntries(winnerEntries))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load prizes")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCandidates = React.useCallback(async () => {
    setLoadingCandidates(true)
    try {
      const response = await fetch(apiV2("/prize-candidates"), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as { data?: PrizeCandidate[] } | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to load prize candidates"))
      }
      setCandidates(json?.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load prize candidates")
    } finally {
      setLoadingCandidates(false)
    }
  }, [])

  const loadOptions = React.useCallback(async () => {
    try {
      const [trialsResponse, categoriesResponse] = await Promise.all([
        fetch(apiV2("/admin/trials"), { cache: "no-store" }),
        fetch(apiV2("/combo-categories?include=all"), { cache: "no-store" }),
      ])
      const trialsJson = (await trialsResponse.json().catch(() => null)) as { data?: TrialOption[] } | null
      const categoriesJson = (await categoriesResponse.json().catch(() => null)) as { data?: ComboCategoryOption[] } | null
      setTrials((trialsJson?.data || []).filter((t) => t.status === "active"))
      setCategories((categoriesJson?.data || []).filter((c) => c.status === "active"))
    } catch {
      // Non-critical: the selects just show fewer/no options.
    }
  }, [])

  React.useEffect(() => {
    load()
    loadCandidates()
    loadOptions()
  }, [load, loadCandidates, loadOptions])

  const createPrize = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      toast.error("Title is required")
      return
    }
    if (criteriaType === "score_reached" && !criteriaScoreTarget.trim()) {
      toast.error("A target score is required for score_reached prizes")
      return
    }

    setCreating(true)
    try {
      const response = await fetch(apiV2("/prizes"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || null,
          criteria_type: criteriaType,
          criteria_trial_name: criteriaType === "trial_wr" ? criteriaTrialName || null : null,
          criteria_combo_category_slug: criteriaType === "combo_wr" ? criteriaComboCategorySlug || null : null,
          criteria_target_role_id: criteriaType === "rankup" ? criteriaTargetRoleId.trim() || null : null,
          criteria_score_target: criteriaType === "score_reached" ? Number(criteriaScoreTarget) : null,
          max_winners: maxWinners.trim() ? Number(maxWinners) : null,
          ends_at: datetimeLocalToUnixSeconds(endsAt),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to create prize"))
      }
      setTitle("")
      setDescription("")
      setCriteriaTrialName("")
      setCriteriaComboCategorySlug("")
      setCriteriaTargetRoleId("")
      setCriteriaScoreTarget("")
      setMaxWinners("")
      setEndsAt("")
      toast.success("Prize created")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create prize")
    } finally {
      setCreating(false)
    }
  }

  const closePrize = async (uuid: string) => {
    setBusyUuid(uuid)
    try {
      const response = await fetch(apiV2(`/prizes/${uuid}/close`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to close prize"))
      }
      toast.success("Prize closed")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to close prize")
    } finally {
      setBusyUuid(null)
    }
  }

  const addWinner = async (prizeUuid: string) => {
    const player = addWinnerSelected[prizeUuid]
    if (!player) {
      toast.error("Search for and select a player first")
      return
    }
    setBusyUuid(prizeUuid)
    try {
      const response = await fetch(apiV2(`/prizes/${prizeUuid}/winners`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player_uuid: player.uuid }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to add winner"))
      }
      setAddWinnerSelected((prev) => ({ ...prev, [prizeUuid]: null }))
      toast.success("Winner added")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to add winner")
    } finally {
      setBusyUuid(null)
    }
  }

  const removeWinner = async (winnerUuid: string) => {
    setBusyUuid(winnerUuid)
    try {
      const response = await fetch(apiV2(`/prizes/winners/${winnerUuid}`), { method: "DELETE" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to remove winner"))
      }
      toast.success("Winner removed, slot reopened")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove winner")
    } finally {
      setBusyUuid(null)
    }
  }

  const toggleClaimed = async (winnerUuid: string, claimed: boolean) => {
    setBusyUuid(winnerUuid)
    try {
      const response = await fetch(apiV2(`/prizes/winners/${winnerUuid}/claim`), {
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

  const reviewCandidate = async (candidateUuid: string, action: "confirm" | "reject") => {
    setBusyUuid(candidateUuid)
    try {
      const response = await fetch(apiV2(`/prize-candidates/${candidateUuid}/${action}`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, `Unable to ${action} candidate`))
      }
      toast.success(action === "confirm" ? "Candidate confirmed as winner" : "Candidate rejected")
      await Promise.all([load(), loadCandidates()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to ${action} candidate`)
    } finally {
      setBusyUuid(null)
    }
  }

  return (
    <>
      <SectionCard
        title="Prize candidates"
        description="Auto-detected qualifying events waiting for confirmation before they become official winners."
      >
        {loadingCandidates ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading candidates...
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending candidates.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const prize = prizes.find((p) => p.uuid === candidate.prize_uuid)
              return (
                <div key={candidate.uuid} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      <Link href={`/players/${candidate.player_uuid}`} className="underline underline-offset-2">
                        {candidate.player_name}
                      </Link>{" "}
                      for {prize?.title ?? candidate.prize_uuid}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Detected {formatTimestamp(candidate.detected_at)}
                      {candidate.event_details ? ` · ${candidate.event_details}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="icon-sm"
                      disabled={busyUuid === candidate.uuid}
                      onClick={() => reviewCandidate(candidate.uuid, "confirm")}
                      aria-label="Confirm candidate"
                    >
                      <CheckIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      disabled={busyUuid === candidate.uuid}
                      onClick={() => reviewCandidate(candidate.uuid, "reject")}
                      aria-label="Reject candidate"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Prizes" description="Owner-only rewards tied to a fixed criteria type, confirmed via the candidate queue above.">
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <NativeSelect value={criteriaType} onChange={(e) => setCriteriaType(e.target.value as PrizeCriteriaType)}>
              {Object.entries(criteriaLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </NativeSelect>
          </div>
          <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />

          {criteriaType === "trial_wr" ? (
            <NativeSelect value={criteriaTrialName} onChange={(e) => setCriteriaTrialName(e.target.value)}>
              <option value="">Any trial</option>
              {trials.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </NativeSelect>
          ) : null}
          {criteriaType === "combo_wr" ? (
            <NativeSelect value={criteriaComboCategorySlug} onChange={(e) => setCriteriaComboCategorySlug(e.target.value)}>
              <option value="">Any category</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </NativeSelect>
          ) : null}
          {criteriaType === "rankup" ? (
            <Input
              placeholder="Target Discord role ID (optional, blank = any promotion)"
              value={criteriaTargetRoleId}
              onChange={(e) => setCriteriaTargetRoleId(e.target.value)}
            />
          ) : null}
          {criteriaType === "score_reached" ? (
            <Input
              type="number"
              placeholder="Target score"
              value={criteriaScoreTarget}
              onChange={(e) => setCriteriaScoreTarget(e.target.value)}
            />
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              type="number"
              placeholder="Max winners (blank = unlimited)"
              value={maxWinners}
              onChange={(e) => setMaxWinners(e.target.value)}
            />
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              title="Deadline (optional, blank = unlimited)"
            />
            <Button type="button" onClick={createPrize} disabled={creating}>
              {creating ? <Spinner className="size-4" /> : null}
              Create prize
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading prizes...
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {prizes.map((prize) => {
              const winners = winnersByPrize[prize.uuid] || []
              return (
                <div key={prize.uuid} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{prize.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {criteriaLabels[prize.criteria_type]}
                        {" · "}
                        {prize.max_winners ? `${winners.length}/${prize.max_winners} winners` : `${winners.length} winners (unlimited)`}
                        {" · "}
                        {formatTimestamp(prize.ends_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={prize.status === "active" ? "default" : prize.status === "won" ? "secondary" : "outline"}>
                        {prize.status}
                      </Badge>
                      {prize.status !== "closed" ? (
                        <Button type="button" variant="outline" size="sm" disabled={busyUuid === prize.uuid} onClick={() => closePrize(prize.uuid)}>
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
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              disabled={busyUuid === winner.uuid}
                              onClick={() => toggleClaimed(winner.uuid, winner.claimed !== 1)}
                            >
                              {winner.claimed ? "Claimed" : "Mark claimed"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={busyUuid === winner.uuid}
                              onClick={() => removeWinner(winner.uuid)}
                              aria-label="Remove winner"
                            >
                              <XIcon className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {prize.status !== "closed" ? (
                    <div className="flex items-start gap-2">
                      <PlayerSearchInput
                        selected={addWinnerSelected[prize.uuid] ?? null}
                        onSelect={(player) => setAddWinnerSelected((prev) => ({ ...prev, [prize.uuid]: player }))}
                        onClear={() => setAddWinnerSelected((prev) => ({ ...prev, [prize.uuid]: null }))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyUuid === prize.uuid || !addWinnerSelected[prize.uuid]}
                        onClick={() => addWinner(prize.uuid)}
                      >
                        Add winner
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {prizes.length === 0 ? <p className="text-sm text-muted-foreground">No prizes yet.</p> : null}
          </div>
        )}
      </SectionCard>
    </>
  )
}
