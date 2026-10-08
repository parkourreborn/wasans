"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { SearchIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { PERMISSION_NAMES } from "@/lib/admin-logs"
import { formatCount, formatDate, formatScore } from "@/lib/format"
import { SUBMISSION_BAN_REASON_MAX_LENGTH } from "@/lib/submission-bans"
import { tierForScore } from "@/lib/tiers"
import { cn } from "@/lib/utils"
import { fetchApi, invalidateApi, useApi } from "@/hooks/use-api"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { ConfirmDialog } from "@/components/site/moderation-dialogs"
import { TierLabel } from "@/components/site/tier-label"
import {
  AdminCard,
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  adminRequest,
  errorText,
  formatAgo,
  nowSeconds,
} from "@/components/site/admin/admin-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type SearchRow = {
  uuid: string
  player_name: string
  score: number
  permission: number
  discord_id: string | null
  discord_avatar: string | null
  discord_discriminator: string | null
  has_roblox_avatar: number
}

type StaffRow = Omit<SearchRow, "score">

type BanRow = { player_uuid: string; player_name: string; reason: string | null; banned_at: number; banned_by_name: string | null }

type PlayerDetail = SearchRow & {
  date_joined: number
  rank: number
  auth_provider: string
  ban: { reason: string | null; banned_at: number; banned_by_name: string | null } | null
  accounts: Array<{ provider: string; provider_account_id: string; username: string | null; display_name: string | null; created_at: number }>
  runs: { approved: number; pending: number; denied: number }
  combos: { approved: number; pending: number; denied: number }
  last_seen: number | null
}

const PERMISSION_HELP = [
  "A regular account: submits runs and combos, nothing to moderate.",
  "Reviews and deletes combo submissions and manages combo categories. No trial moderation.",
  "Reviews trial runs and combos: approve, deny, notes, edit times. Reads the logs. Can’t delete trial runs.",
  "Everything a junior moderator does, plus deleting trial runs.",
  "Full access, including this panel, permissions, bans, trials and site settings.",
]

const ROLE_COLORS = ["text-muted-foreground", "text-[#61d5c0]", "text-[#69c1fc]", "text-[#bf9bfc]", "text-primary"]

const STAFF_URL = apiV2("/admin/staff")
const BANS_URL = apiV2("/admin/submission-bans")
const playerUrl = (uuid: string) => apiV2(`/admin/players/${encodeURIComponent(uuid)}`)

const PROVIDER_LABELS: Record<string, string> = { discord: "Discord", roblox: "Roblox", google: "Google" }

export function AdminPlayersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = searchParams.get("player")

  const select = (uuid: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (uuid) params.set("player", uuid)
    else params.delete("player")
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false })
  }

  return (
    <AdminPage title="Players" description="Find a player to change what they can do or stop them submitting.">
      <PlayerSearch onSelect={select} />
      {selected ? <PlayerPanel uuid={selected} onClose={() => select(null)} /> : null}
      <div className="grid gap-8 lg:grid-cols-2">
        <StaffList onSelect={select} />
        <BanList onSelect={select} />
      </div>
    </AdminPage>
  )
}

function PlayerSearch({ onSelect }: { onSelect: (uuid: string) => void }) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [timer, setTimer] = useState<number | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const trimmed = debounced.trim()
  const isDiscordId = /^\d{15,21}$/.test(trimmed)
  const { data, loading } = useApi<{ data: SearchRow[] }>(
    trimmed && !isDiscordId ? `${apiV2("/players")}?search=${encodeURIComponent(trimmed)}&limit=8` : null
  )
  const results = data?.data ?? []

  const onChange = (value: string) => {
    setQuery(value)
    if (timer) window.clearTimeout(timer)
    setTimer(window.setTimeout(() => setDebounced(value), 250))
  }

  const lookUpDiscord = async () => {
    setLookingUp(true)
    try {
      const response = await fetch(apiV2(`/admin/players/by-discord/${encodeURIComponent(trimmed)}`), { cache: "no-store" })
      const json = (await response.json().catch(() => null)) as { data?: { uuid?: string } } | null
      if (!response.ok || !json?.data?.uuid) throw new Error("No player has that Discord account linked.")
      onSelect(json.data.uuid)
    } catch (error) {
      toast.error(errorText(error, "No player has that Discord account linked."))
    } finally {
      setLookingUp(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block max-w-xl">
        <span className="sr-only">Find a player by name or Discord id</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isDiscordId) void lookUpDiscord()
            if (event.key === "Enter" && results.length === 1) onSelect(results[0].uuid)
          }}
          placeholder="Name or Discord id"
          className="h-11 pl-9 text-[15px]"
        />
      </label>
      {isDiscordId ? (
        <div className="flex max-w-xl items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span className="flex-1 text-muted-foreground">That looks like a Discord id.</span>
          <Button size="sm" variant="outline" onClick={() => void lookUpDiscord()} disabled={lookingUp}>
            {lookingUp ? <Spinner className="size-3.5" /> : null}
            Find player
          </Button>
        </div>
      ) : trimmed ? (
        <div className="max-w-xl overflow-hidden rounded-lg border border-line bg-surface">
          {loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No player called “{trimmed}”.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {results.map((row) => (
                <li key={row.uuid} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onSelect(row.uuid)}
                    className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-surface-2"
                  >
                    <PlayerAvatar
                      className="size-7"
                      playerName={row.player_name}
                      playerUuid={row.uuid}
                      hasRobloxAvatar={row.has_roblox_avatar}
                      discordId={row.discord_id}
                      discordAvatar={row.discord_avatar}
                      discordDiscriminator={row.discord_discriminator}
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{row.player_name}</span>
                    {row.permission > 0 ? (
                      <span className={cn("label-caps text-[12px]", ROLE_COLORS[row.permission])}>{PERMISSION_NAMES[row.permission]}</span>
                    ) : null}
                    <span className="num text-[13px] text-muted-foreground">{formatScore(row.score)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function PlayerPanel({ uuid, onClose }: { uuid: string; onClose: () => void }) {
  const { data, error, loading, refetch } = useApi<{ data: PlayerDetail }>(playerUrl(uuid))
  const player = data?.data

  if (loading && !player) return <AdminLoading label="Loading player" />
  if (error && !player) return <AdminError message={error} onRetry={refetch} />
  if (!player) return null

  return <PlayerDetailCard key={player.uuid} player={player} onClose={onClose} />
}

function PlayerDetailCard({ player, onClose }: { player: PlayerDetail; onClose: () => void }) {
  const { user } = useAuthSession()
  const [tier, setTier] = useState(player.permission)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState("")
  const [confirmBan, setConfirmBan] = useState(false)
  const [banBusy, setBanBusy] = useState(false)
  const isSelf = user?.uuid === player.uuid
  const tierInfo = tierForScore(Number(player.score))
  const now = nowSeconds()
  const changed = tier !== player.permission

  const refresh = () => {
    void fetchApi(playerUrl(player.uuid), { force: true })
    invalidateApi(STAFF_URL)
    invalidateApi(BANS_URL)
    invalidateApi(apiV2("/players"))
  }

  const savePermission = async () => {
    setSaving(true)
    try {
      await adminRequest(`/admin/players/${encodeURIComponent(player.uuid)}/permission`, {
        method: "PATCH",
        body: { permission: tier },
        fallback: "Couldn’t change their permission",
      })
      toast.success(`${player.player_name} is now ${PERMISSION_NAMES[tier].toLowerCase() === "player" ? "a player" : `a ${PERMISSION_NAMES[tier].toLowerCase()}`}`)
      refresh()
    } catch (error) {
      toast.error(errorText(error, "Couldn’t change their permission"))
    } finally {
      setSaving(false)
    }
  }

  const ban = async () => {
    setBanBusy(true)
    try {
      await adminRequest(`/admin/players/${encodeURIComponent(player.uuid)}/submission-ban`, {
        method: "PUT",
        body: { reason: reason.trim() },
        fallback: "Couldn’t ban them",
      })
      toast.success(`${player.player_name} can no longer submit`)
      setConfirmBan(false)
      setReason("")
      refresh()
    } catch (error) {
      toast.error(errorText(error, "Couldn’t ban them"))
    } finally {
      setBanBusy(false)
    }
  }

  const lift = async () => {
    setBanBusy(true)
    try {
      await adminRequest(`/admin/players/${encodeURIComponent(player.uuid)}/submission-ban`, { method: "DELETE", fallback: "Couldn’t lift the ban" })
      toast.success(`${player.player_name} can submit again`)
      refresh()
    } catch (error) {
      toast.error(errorText(error, "Couldn’t lift the ban"))
    } finally {
      setBanBusy(false)
    }
  }

  const runLine = (label: string, counts: PlayerDetail["runs"]) =>
    `${label}: ${formatCount(counts.approved)} approved, ${formatCount(counts.pending)} pending, ${formatCount(counts.denied)} denied`

  return (
    <AdminCard className="flex flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-4">
        <PlayerAvatar
          className="size-12"
          playerName={player.player_name}
          playerUuid={player.uuid}
          hasRobloxAvatar={player.has_roblox_avatar}
          discordId={player.discord_id}
          discordAvatar={player.discord_avatar}
          discordDiscriminator={player.discord_discriminator}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-display text-[30px] font-extrabold uppercase leading-none">
            {player.player_name}
            {isSelf ? <span className="ml-2 align-middle font-sans text-[13px] font-normal normal-case text-subtle-foreground">(you)</span> : null}
          </h2>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <TierLabel tier={tierInfo} className="text-[14px]" />
            <span>
              Score <span className="num text-foreground">{formatScore(player.score)}</span>, rank <span className="num text-foreground">#{player.rank}</span>
            </span>
            <span>Joined {formatDate(player.date_joined)}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/players/${encodeURIComponent(player.uuid)}`}>Profile</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/submissions/trials?player_uuid=${encodeURIComponent(player.uuid)}`}>Their runs</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/logs?q=${encodeURIComponent(player.player_name)}`}>Log entries</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="grid gap-px bg-line lg:grid-cols-2">
        <div className="flex flex-col gap-6 bg-surface p-4">
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="label-caps mb-3 text-[13px] text-subtle-foreground">Permission</legend>
            <div role="radiogroup" aria-label="Permission" className="flex flex-wrap gap-1.5">
              {PERMISSION_NAMES.map((name, level) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={tier === level}
                  onClick={() => setTier(level)}
                  className={cn(
                    "label-caps h-9 rounded-md border px-3 text-[13px]",
                    tier === level ? "border-foreground bg-foreground text-background" : "border-line-strong text-muted-foreground hover:text-foreground"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{PERMISSION_HELP[tier]}</p>
            {changed ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  Change {player.player_name} from <b>{PERMISSION_NAMES[player.permission]}</b> to <b>{PERMISSION_NAMES[tier]}</b>?
                  {isSelf && tier < player.permission ? " You’ll lose access to this page." : " It applies on their next page load."}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setTier(player.permission)} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void savePermission()} disabled={saving}>
                  {saving ? <Spinner className="size-3.5" /> : null}
                  Save
                </Button>
              </div>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <span className="label-caps text-[13px] text-subtle-foreground">Submission ban</span>
            {player.ban ? (
              <>
                <p className="m-0 text-[14px]">
                  <span className="text-destructive">Banned</span> {formatAgo(player.ban.banned_at, now)}
                  {player.ban.banned_by_name ? ` by ${player.ban.banned_by_name}` : ""}.
                  <span className="mt-1 block text-muted-foreground">{player.ban.reason || "No reason given."}</span>
                </p>
                <div>
                  <Button size="sm" variant="outline" onClick={() => void lift()} disabled={banBusy}>
                    {banBusy ? <Spinner className="size-3.5" /> : null}
                    Lift the ban
                  </Button>
                </div>
              </>
            ) : player.permission >= 4 ? (
              <p className="m-0 text-[13px] text-muted-foreground">Owners can’t be banned. Change their permission first.</p>
            ) : (
              <>
                <p className="m-0 text-[13px] text-muted-foreground">
                  Not banned. A ban stops new runs and combos; they keep their account, approved runs and score.
                </p>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                  Reason they’ll see on the Submit page (optional)
                  <Textarea
                    rows={2}
                    value={reason}
                    maxLength={SUBMISSION_BAN_REASON_MAX_LENGTH}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="e.g. Repeated overlay violations"
                  />
                </label>
                <div>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmBan(true)}>
                    Ban from submitting
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-surface p-4">
          <span className="label-caps text-[13px] text-subtle-foreground">Linked accounts</span>
          {player.accounts.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">None linked.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {player.accounts.map((account) => (
                <li key={`${account.provider}:${account.provider_account_id}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-line py-2.5 last:border-b-0">
                  <span className="label-caps text-[13px] text-muted-foreground">{PROVIDER_LABELS[account.provider] ?? account.provider}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px]">
                      {account.display_name || account.username || "Unnamed"}
                      {account.username && account.display_name && account.username !== account.display_name ? (
                        <span className="text-muted-foreground"> (@{account.username})</span>
                      ) : null}
                    </span>
                    <span className="num truncate text-[12px] text-subtle-foreground">{account.provider_account_id}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl className="m-0 mt-auto flex flex-col gap-1.5 border-t border-line pt-4 text-[13px] text-muted-foreground">
            <div>Last seen {player.last_seen ? formatAgo(player.last_seen, now) : "never"}.</div>
            <div>{runLine("Trial runs", player.runs)}.</div>
            <div>{runLine("Combos", player.combos)}.</div>
          </dl>
        </div>
      </div>

      <ConfirmDialog
        open={confirmBan}
        onOpenChange={setConfirmBan}
        title={`Ban ${player.player_name} from submitting?`}
        description={
          reason.trim()
            ? `They’ll see: “${reason.trim()}”. You can lift it any time.`
            : "They’ll be told they can’t submit, without a reason. You can lift it any time."
        }
        confirmLabel="Ban"
        busy={banBusy}
        onConfirm={() => void ban()}
      />
    </AdminCard>
  )
}

function StaffList({ onSelect }: { onSelect: (uuid: string) => void }) {
  const { data, error, loading, refetch } = useApi<{ data: StaffRow[] }>(STAFF_URL)
  const staff = data?.data ?? []
  return (
    <AdminSection title="Staff" count={data ? staff.length : undefined}>
      {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !data ? <AdminLoading /> : null}
      {data ? (
        <AdminCard>
          <ul className="m-0 list-none p-0">
            {staff.map((row) => (
              <li key={row.uuid} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(row.uuid)}
                  className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-surface-2"
                >
                  <PlayerAvatar
                    className="size-7"
                    playerName={row.player_name}
                    playerUuid={row.uuid}
                    hasRobloxAvatar={row.has_roblox_avatar}
                    discordId={row.discord_id}
                    discordAvatar={row.discord_avatar}
                    discordDiscriminator={row.discord_discriminator}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{row.player_name}</span>
                  <span className={cn("label-caps text-[13px]", ROLE_COLORS[row.permission])}>{PERMISSION_NAMES[row.permission]}</span>
                </button>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </AdminSection>
  )
}

function BanList({ onSelect }: { onSelect: (uuid: string) => void }) {
  const { data, error, loading, refetch } = useApi<{ data: BanRow[] }>(BANS_URL)
  const [busy, setBusy] = useState<string | null>(null)
  const bans = data?.data ?? []
  const now = nowSeconds()

  const lift = async (ban: BanRow) => {
    setBusy(ban.player_uuid)
    try {
      await adminRequest(`/admin/players/${encodeURIComponent(ban.player_uuid)}/submission-ban`, { method: "DELETE", fallback: "Couldn’t lift the ban" })
      toast.success(`${ban.player_name} can submit again`)
      invalidateApi(BANS_URL)
      invalidateApi(playerUrl(ban.player_uuid))
    } catch (error) {
      toast.error(errorText(error, "Couldn’t lift the ban"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminSection title="Banned from submitting" count={data ? bans.length : undefined}>
      {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !data ? <AdminLoading /> : null}
      {data && bans.length === 0 ? <AdminEmpty>Nobody is banned. Find a player above to ban them.</AdminEmpty> : null}
      {bans.length > 0 ? (
        <AdminCard>
          <ul className="m-0 list-none p-0">
            {bans.map((ban) => (
              <li key={ban.player_uuid} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <button type="button" onClick={() => onSelect(ban.player_uuid)} className="w-fit text-left text-[15px] hover:underline">
                    {ban.player_name}
                  </button>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {ban.reason || "No reason given"} · {ban.banned_by_name ?? "unknown"}, {formatAgo(ban.banned_at, now)}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => void lift(ban)} disabled={busy === ban.player_uuid}>
                  {busy === ban.player_uuid ? <Spinner className="size-3.5" /> : null}
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </AdminSection>
  )
}
