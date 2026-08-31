"use client"

import * as React from "react"
import { apiV2 } from "@/lib/api"
import { SUBMISSION_BAN_REASON_MAX_LENGTH } from "@/lib/submission-bans"
import { ErrorState, PageHeader, PageShell, SectionCard } from "@/components/custom/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

type AuthUser = { uuid: string; permission: number }
type AuthResponse = { data?: { user: AuthUser | null } }

type PlayerRow = { uuid: string; player_name: string; permission: number; score: number }
type PlayersResponse = { data?: PlayerRow[] }

type TrialRow = {
  name: string
  status: "active" | "removed"
  added_at: number
  version: number
  version_changed_at: number | null
  removed_at: number | null
}
type TrialsResponse = { data?: TrialRow[] }

type FlagRow = { key: string; enabled: number; updated_at: number; updated_by: string | null }
type FlagsResponse = { data?: FlagRow[] }

type SubmissionBanRow = {
  player_uuid: string
  player_name: string
  reason: string | null
  banned_at: number
  banned_by_name: string | null
}
type SubmissionBansResponse = { data?: SubmissionBanRow[] }

const permissionLabels: Record<number, string> = { 0: "Member", 1: "Moderator", 2: "Owner" }

function formatTimestamp(value: number | null) {
  if (!value) {
    return "—"
  }
  return new Date(value * 1000).toLocaleString()
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

export default function AdminPage() {
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = React.useState(false)

  const [playerQuery, setPlayerQuery] = React.useState("")
  const [playerResults, setPlayerResults] = React.useState<PlayerRow[]>([])
  const [searchingPlayers, setSearchingPlayers] = React.useState(false)
  const [permissionSaving, setPermissionSaving] = React.useState<string | null>(null)

  const [trials, setTrials] = React.useState<TrialRow[]>([])
  const [loadingTrials, setLoadingTrials] = React.useState(true)
  const [newTrialName, setNewTrialName] = React.useState("")
  const [trialActionBusy, setTrialActionBusy] = React.useState<string | null>(null)

  const [submissionBans, setSubmissionBans] = React.useState<SubmissionBanRow[]>([])
  const [loadingBans, setLoadingBans] = React.useState(true)
  const [banBusy, setBanBusy] = React.useState<string | null>(null)
  const [banTarget, setBanTarget] = React.useState<{ uuid: string; player_name: string } | null>(null)
  const [banReason, setBanReason] = React.useState("")

  const [flags, setFlags] = React.useState<FlagRow[]>([])
  const [loadingFlags, setLoadingFlags] = React.useState(true)
  const [flagSaving, setFlagSaving] = React.useState<string | null>(null)

  const [maintenanceBusy, setMaintenanceBusy] = React.useState<"refresh" | "deduplicate" | null>(null)

  React.useEffect(() => {
    const loadAuth = async () => {
      try {
        const response = await fetch(apiV2("/auth/me"), { cache: "no-store" })
        const json = (await response.json().catch(() => null)) as AuthResponse | null
        setAuthUser(json?.data?.user ?? null)
      } finally {
        setAuthChecked(true)
      }
    }
    loadAuth()
  }, [])

  const isOwner = (authUser?.permission ?? 0) >= 2

  const loadTrials = React.useCallback(async () => {
    setLoadingTrials(true)
    try {
      const response = await fetch(apiV2("/admin/trials"), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as TrialsResponse | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to load trials"))
      }
      setTrials(json?.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load trials")
    } finally {
      setLoadingTrials(false)
    }
  }, [])

  const loadFlags = React.useCallback(async () => {
    setLoadingFlags(true)
    try {
      const response = await fetch(apiV2("/admin/flags"), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as FlagsResponse | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to load feature flags"))
      }
      setFlags(json?.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load feature flags")
    } finally {
      setLoadingFlags(false)
    }
  }, [])

  const loadSubmissionBans = React.useCallback(async () => {
    setLoadingBans(true)
    try {
      const response = await fetch(apiV2("/admin/submission-bans"), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as SubmissionBansResponse | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to load submission bans"))
      }
      setSubmissionBans(json?.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load submission bans")
    } finally {
      setLoadingBans(false)
    }
  }, [])

  React.useEffect(() => {
    if (!isOwner) {
      return
    }
    loadTrials()
    loadFlags()
    loadSubmissionBans()
  }, [isOwner, loadTrials, loadFlags, loadSubmissionBans])

  const bannedUuids = React.useMemo(
    () => new Set(submissionBans.map((ban) => ban.player_uuid)),
    [submissionBans]
  )

  const searchPlayers = React.useCallback(async (query: string) => {
    setSearchingPlayers(true)
    try {
      const response = await fetch(`${apiV2("/players")}?search=${encodeURIComponent(query)}&limit=20`, { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as PlayersResponse | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to search players"))
      }
      setPlayerResults(json?.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to search players")
    } finally {
      setSearchingPlayers(false)
    }
  }, [])

  React.useEffect(() => {
    if (!isOwner || !playerQuery.trim()) {
      setPlayerResults([])
      return
    }
    const timeout = window.setTimeout(() => searchPlayers(playerQuery.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [isOwner, playerQuery, searchPlayers])

  const setPermission = async (uuid: string, permission: number) => {
    setPermissionSaving(uuid)
    try {
      const response = await fetch(apiV2(`/admin/players/${encodeURIComponent(uuid)}/permission`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permission }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to update permission"))
      }
      setPlayerResults((current) => current.map((row) => (row.uuid === uuid ? { ...row, permission } : row)))
      toast.success("Permission updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update permission")
    } finally {
      setPermissionSaving(null)
    }
  }

  const banFromSubmitting = async () => {
    if (!banTarget) {
      return
    }

    const { uuid, player_name } = banTarget
    setBanBusy(uuid)
    try {
      const response = await fetch(apiV2(`/admin/players/${encodeURIComponent(uuid)}/submission-ban`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: banReason }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to ban that player from submitting"))
      }
      setBanTarget(null)
      setBanReason("")
      toast.success(`${player_name} can no longer submit runs`)
      await loadSubmissionBans()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to ban that player from submitting")
    } finally {
      setBanBusy(null)
    }
  }

  const unbanFromSubmitting = async (uuid: string, playerName: string) => {
    setBanBusy(uuid)
    try {
      const response = await fetch(apiV2(`/admin/players/${encodeURIComponent(uuid)}/submission-ban`), {
        method: "DELETE",
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to unban that player"))
      }
      toast.success(`${playerName} can submit runs again`)
      await loadSubmissionBans()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to unban that player")
    } finally {
      setBanBusy(null)
    }
  }

  const createTrial = async () => {
    const name = newTrialName.trim()
    if (!name) {
      return
    }
    setTrialActionBusy("create")
    try {
      const response = await fetch(apiV2("/admin/trials"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to add trial"))
      }
      setNewTrialName("")
      toast.success(`${name} activated — its 7-day grace period starts now`)
      await loadTrials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to add trial")
    } finally {
      setTrialActionBusy(null)
    }
  }

  const retireTrial = async (name: string) => {
    setTrialActionBusy(name)
    try {
      const response = await fetch(apiV2(`/admin/trials/${encodeURIComponent(name)}/retire`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to retire trial"))
      }
      toast.success(`${name} retired — keeps counting for 7 more days`)
      await loadTrials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to retire trial")
    } finally {
      setTrialActionBusy(null)
    }
  }

  const bumpTrialVersion = async (name: string) => {
    setTrialActionBusy(name)
    try {
      const response = await fetch(apiV2(`/admin/trials/${encodeURIComponent(name)}/bump-version`), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to bump trial version"))
      }
      toast.success(`${name} marked changed — old times keep counting for 7 more days`)
      await loadTrials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to bump trial version")
    } finally {
      setTrialActionBusy(null)
    }
  }

  const toggleFlag = async (key: string, enabled: boolean) => {
    setFlagSaving(key)
    try {
      const response = await fetch(apiV2(`/admin/flags/${encodeURIComponent(key)}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to update flag"))
      }
      setFlags((current) => current.map((flag) => (flag.key === key ? { ...flag, enabled: enabled ? 1 : 0 } : flag)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update flag")
    } finally {
      setFlagSaving(null)
    }
  }

  const refreshLeaderboards = async () => {
    setMaintenanceBusy("refresh")
    try {
      const response = await fetch(apiV2("/admin/leaderboards/refresh"), { method: "POST" })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to refresh leaderboards"))
      }
      toast.success("Every player's score has been recalculated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to refresh leaderboards")
    } finally {
      setMaintenanceBusy(null)
    }
  }

  const deduplicateSubmissions = async () => {
    setMaintenanceBusy("deduplicate")
    try {
      const response = await fetch(apiV2("/admin/maintenance/deduplicate"), { method: "POST" })
      const json = (await response.json().catch(() => null)) as { data?: { deletedCount?: number } } | null
      if (!response.ok) {
        throw new Error(jsonErrorMessage(json, "Unable to deduplicate submissions"))
      }
      toast.success(`Removed ${json?.data?.deletedCount ?? 0} duplicate submission(s)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to deduplicate submissions")
    } finally {
      setMaintenanceBusy(null)
    }
  }

  if (!authChecked) {
    return (
      <PageShell>
        <div className="flex min-h-48 items-center justify-center">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      </PageShell>
    )
  }

  if (!isOwner) {
    return (
      <PageShell>
        <PageHeader title="Admin" />
        <ErrorState title="Owner access required" message="You do not have permission to view this page." />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="Admin" description="Owner-only controls: promote players, manage trials, and toggle site-wide feature flags." />

      <SectionCard title="Player permissions" description="Search a player by name and change their access tier.">
        <div className="space-y-3">
          {/* Pins while this card is on screen, so the search stays reachable
              as you scroll a long result list, then releases with the card. */}
          <div className="sticky top-14 z-20 -mt-4 bg-card pt-4 pb-3 md:top-0 md:-mt-5 md:pt-5">
            <Input
              value={playerQuery}
              onChange={(event) => setPlayerQuery(event.target.value)}
              placeholder="Search players by name"
            />
          </div>

          {searchingPlayers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Searching...
            </div>
          ) : null}

          {playerResults.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Submitting</TableHead>
                    <TableHead className="text-right">Set to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playerResults.map((row) => {
                    const isBanned = bannedUuids.has(row.uuid)

                    return (
                      <TableRow key={row.uuid}>
                        <TableCell className="font-medium">{row.player_name}</TableCell>
                        <TableCell>{Number(row.score).toFixed(3)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{permissionLabels[row.permission] ?? row.permission}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={isBanned ? "destructive" : "secondary"}>
                              {isBanned ? "Banned" : "Allowed"}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant={isBanned ? "outline" : "destructive"}
                              disabled={banBusy === row.uuid || loadingBans}
                              onClick={() => {
                                if (isBanned) {
                                  unbanFromSubmitting(row.uuid, row.player_name)
                                  return
                                }
                                setBanReason("")
                                setBanTarget({ uuid: row.uuid, player_name: row.player_name })
                              }}
                            >
                              {isBanned ? "Unban" : "Ban"}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1.5">
                            {[0, 1, 2].map((level) => (
                              <Button
                                key={level}
                                type="button"
                                size="sm"
                                variant={row.permission === level ? "default" : "outline"}
                                disabled={permissionSaving === row.uuid}
                                onClick={() => setPermission(row.uuid, level)}
                              >
                                {permissionLabels[level]}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Submission bans"
        description="Banned players keep their account, approved runs, and score — they just cannot create new submissions until the ban is lifted."
      >
        {loadingBans ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading submission bans...
          </div>
        ) : submissionBans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is banned from submitting. Search a player above to ban them.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Banned by</TableHead>
                  <TableHead>Banned at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissionBans.map((ban) => (
                  <TableRow key={ban.player_uuid}>
                    <TableCell className="font-medium">{ban.player_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ban.reason || "No reason given"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ban.banned_by_name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTimestamp(ban.banned_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={banBusy === ban.player_uuid}
                        onClick={() => unbanFromSubmitting(ban.player_uuid, ban.player_name)}
                      >
                        Unban
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null)
            setBanReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {banTarget?.player_name} from submitting</DialogTitle>
            <DialogDescription>
              They keep their account and their approved runs, but any new submission is rejected until you unban them.
              The reason is shown to them on the New Submission page.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={banReason}
            maxLength={SUBMISSION_BAN_REASON_MAX_LENGTH}
            onChange={(event) => setBanReason(event.target.value)}
            placeholder="Reason (optional)"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={banBusy !== null}
              onClick={banFromSubmitting}
            >
              {banBusy ? <Spinner className="size-4" /> : null}
              Ban from submitting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SectionCard
        title="Trials"
        description="Add, retire, or mark a trial changed. Every change has a 7-day grace period before it affects scores."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newTrialName}
              onChange={(event) => setNewTrialName(event.target.value)}
              placeholder="Exact trial name from src/lib/trials.ts"
              className="sm:flex-1"
            />
            <Button type="button" disabled={trialActionBusy === "create" || !newTrialName.trim()} onClick={createTrial}>
              Add trial
            </Button>
          </div>

          {loadingTrials ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading trials...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Removed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trials.map((trial) => (
                    <TableRow key={trial.name}>
                      <TableCell className="font-medium">{trial.name}</TableCell>
                      <TableCell>
                        <Badge variant={trial.status === "active" ? "secondary" : "destructive"}>{trial.status}</Badge>
                      </TableCell>
                      <TableCell>
                        v{trial.version}
                        {trial.version_changed_at ? (
                          <span className="text-xs text-muted-foreground"> · changed {formatTimestamp(trial.version_changed_at)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTimestamp(trial.added_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTimestamp(trial.removed_at)}</TableCell>
                      <TableCell className="text-right">
                        {trial.status === "active" ? (
                          <div className="inline-flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={trialActionBusy === trial.name}
                              onClick={() => bumpTrialVersion(trial.name)}
                            >
                              Mark changed
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={trialActionBusy === trial.name}
                              onClick={() => retireTrial(trial.name)}
                            >
                              Retire
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {trials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No trials registered yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Feature flags" description="Site-wide kill switches. Owners can still moderate while moderation is disabled for everyone else.">
        {loadingFlags ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading flags...
          </div>
        ) : (
          <div className="space-y-2">
            {flags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{flag.key.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {flag.updated_by ? `Last changed by ${flag.updated_by} · ${formatTimestamp(flag.updated_at)}` : "Never changed"}
                  </p>
                </div>
                <Switch
                  checked={flag.enabled === 1}
                  disabled={flagSaving === flag.key}
                  onCheckedChange={(checked) => toggleFlag(flag.key, checked)}
                  aria-label={`Toggle ${flag.key}`}
                />
              </div>
            ))}
            {flags.length === 0 ? <p className="text-sm text-muted-foreground">No feature flags registered yet.</p> : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Maintenance" description="One-off tools for fixing data drift. Safe to run any time, but not something you'll need often.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={maintenanceBusy !== null}
            onClick={refreshLeaderboards}
          >
            {maintenanceBusy === "refresh" ? <Spinner className="size-4" /> : null}
            Recalculate every score
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={maintenanceBusy !== null}
            onClick={deduplicateSubmissions}
          >
            {maintenanceBusy === "deduplicate" ? <Spinner className="size-4" /> : null}
            Remove duplicate submissions
          </Button>
        </div>
      </SectionCard>
    </PageShell>
  )
}
