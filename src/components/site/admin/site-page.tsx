"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { apiV2 } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { invalidateApi, setApiData, useApi } from "@/hooks/use-api"
import { ConfirmDialog } from "@/components/site/moderation-dialogs"
import { useGameVersions, VERSIONS_URL, type GameVersion } from "@/components/site/game-versions"
import {
  AdminCard,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  adminRequest,
  errorText,
  formatAgo,
  formatDuration,
  nowSeconds,
} from "@/components/site/admin/admin-kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"

type Flag = { key: string; enabled: boolean; updated_at: number | null; updated_by: string | null }
type LastRun = { created_at: number; actor_name: string | null; details: Record<string, unknown> | null }
type SiteData = {
  flags: Flag[]
  video: { processing: number; failed_7d: number; failed_pending: number; avg_seconds_24h: number | null }
  backfill: { started: boolean; remaining: number; inFlight: number; failed: number }
  last_runs: Record<string, LastRun | undefined>
}

const SITE_URL = apiV2("/admin/site")
const POLL_MS = 10_000

const FLAGS: Record<string, { label: string; help: string; risky: "off" | "on" }> = {
  submissions_enabled: { label: "Trial submissions", help: "Players can submit trial runs and upload videos.", risky: "off" },
  combo_submissions_enabled: { label: "Combo submissions", help: "Players can submit combos.", risky: "off" },
  moderation_enabled: { label: "Moderation", help: "Moderators can approve, deny and edit runs. Owners always can.", risky: "off" },
  require_roblox_link: { label: "Require a linked Roblox account", help: "Players must link Roblox before they can submit.", risky: "on" },
}

const TOOLS = [
  {
    action: "scores_recalculated",
    path: "/admin/leaderboards/refresh",
    label: "Recalculate every score",
    help: "Rebuilds PBs, records and every player’s score from approved runs.",
    confirm: "This rebuilds every player’s score from their approved runs. It takes a few seconds and changes nothing if scores are already right.",
    done: () => "Every score was recalculated",
  },
  {
    action: "duplicates_removed",
    path: "/admin/maintenance/deduplicate",
    label: "Remove duplicate submissions",
    help: "Deletes exact repeats of a run (same player, trial and time), keeping the newest.",
    confirm: "Exact repeats of the same run are deleted, keeping the newest copy. This can’t be undone.",
    done: (data: unknown) => {
      const count = Number((data as { deletedCount?: number } | undefined)?.deletedCount ?? 0)
      return count === 0 ? "No duplicates found" : `Removed ${count} duplicate${count === 1 ? "" : "s"}`
    },
  },
  {
    action: "analytics_backfilled",
    path: "/admin/analytics/backfill",
    label: "Backfill analytics history",
    help: "Rebuilds score and rank history from past runs, for the profile charts.",
    confirm: "Score and rank history is rebuilt from past runs. Safe to run again; it can take a while on a big database.",
    done: () => "Analytics history rebuilt",
  },
] as const

function lastRunText(run: LastRun | undefined, now: number) {
  if (!run) return "Never run"
  const by = run.actor_name ? ` by ${run.actor_name}` : ""
  const removed = run.details && typeof run.details.deleted_count === "number" ? `, removed ${run.details.deleted_count}` : ""
  return `Last run ${formatAgo(run.created_at, now)}${by}${removed}`
}

export function AdminSitePage() {
  const { data, error, loading, refetch } = useApi<{ data: SiteData }>(SITE_URL)
  const site = data?.data
  const running = Boolean(site && site.backfill.inFlight > 0)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(refetch, POLL_MS)
    return () => window.clearInterval(timer)
  }, [running, refetch])

  return (
    <AdminPage title="Site">
      {error && !site ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !site ? <AdminLoading /> : null}
      {site && data ? (
        <>
          <Switches flags={site.flags} onChange={(flags) => setApiData(SITE_URL, { ...data, data: { ...site, flags } })} />
          <GameVersions />
          <Video site={site} onChanged={refetch} />
          <Maintenance site={site} />
        </>
      ) : null}
    </AdminPage>
  )
}

function Switches({ flags, onChange }: { flags: Flag[]; onChange: (flags: Flag[]) => void }) {
  const [saving, setSaving] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ flag: Flag; next: boolean } | null>(null)
  const now = nowSeconds()

  const save = async (flag: Flag, next: boolean) => {
    setSaving(flag.key)
    try {
      await adminRequest(`/admin/flags/${encodeURIComponent(flag.key)}`, { method: "PATCH", body: { enabled: next }, fallback: "Couldn’t change that switch" })
      onChange(flags.map((entry) => (entry.key === flag.key ? { ...entry, enabled: next, updated_at: nowSeconds(), updated_by: "you" } : entry)))
      toast.success(`${FLAGS[flag.key]?.label ?? flag.key} ${next ? "on" : "off"}`)
      setConfirm(null)
      invalidateApi(apiV2("/admin/overview"))
    } catch (err) {
      toast.error(errorText(err, "Couldn’t change that switch"))
    } finally {
      setSaving(null)
    }
  }

  const toggle = (flag: Flag, next: boolean) => {
    const meta = FLAGS[flag.key]
    const risky = meta ? (meta.risky === "off" ? !next : next) : false
    if (risky) setConfirm({ flag, next })
    else void save(flag, next)
  }

  const confirmMeta = confirm ? FLAGS[confirm.flag.key] : null

  return (
    <AdminSection title="Switches" description="They take effect straight away for everyone.">
      <AdminCard>
        <ul className="m-0 list-none p-0">
          {flags.map((flag) => {
            const meta = FLAGS[flag.key] ?? { label: flag.key, help: "", risky: "off" as const }
            return (
              <li key={flag.key} className="flex min-h-16 items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px]">{meta.label}</span>
                  <span className="text-[13px] text-muted-foreground">{meta.help}</span>
                  <span className="text-[12px] text-subtle-foreground">
                    {flag.updated_at && flag.updated_by
                      ? `Turned ${flag.enabled ? "on" : "off"} by ${flag.updated_by}, ${formatAgo(flag.updated_at, now)}`
                      : "Never changed"}
                  </span>
                </span>
                <span className={cn("label-caps hidden w-8 text-[13px] sm:block", flag.enabled ? "text-success" : "text-subtle-foreground")}>
                  {flag.enabled ? "On" : "Off"}
                </span>
                <Switch
                  checked={flag.enabled}
                  disabled={saving === flag.key}
                  onCheckedChange={(next) => toggle(flag, next)}
                  aria-label={meta.label}
                  className="data-checked:bg-success"
                />
              </li>
            )
          })}
        </ul>
      </AdminCard>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm && confirmMeta ? `Turn ${confirm.next ? "on" : "off"} ${confirmMeta.label.toLowerCase()}?` : ""}
        description={
          confirm?.flag.key === "require_roblox_link"
            ? "Players without a linked Roblox account won’t be able to submit until they link one."
            : confirm?.flag.key === "moderation_enabled"
              ? "Moderators won’t be able to approve, deny or edit runs. Owners still can."
              : "Players won’t be able to submit until you turn it back on."
        }
        confirmLabel={confirm?.next ? "Turn on" : "Turn off"}
        busy={saving !== null}
        onConfirm={() => confirm && void save(confirm.flag, confirm.next)}
      />
    </AdminSection>
  )
}

function GameVersions() {
  const { data, error, loading, refetch } = useGameVersions()
  const versions = data?.data?.versions
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const now = nowSeconds()

  // Adding one here is for a new game update, so it becomes current too.
  const save = async (action: "add" | "current" | "remove", version: string) => {
    setBusy(action === "add" ? "" : `${action}:${version}`)
    try {
      const result = await adminRequest<{ versions: GameVersion[] }>(
        action === "add" ? "/admin/versions" : action === "current" ? "/admin/versions/current" : `/admin/versions?name=${encodeURIComponent(version)}`,
        {
          method: action === "add" ? "POST" : action === "current" ? "PUT" : "DELETE",
          body: action === "add" ? { name: version, current: true } : action === "current" ? { name: version } : undefined,
          fallback: "That didn’t save",
        }
      )
      if (result) setApiData(VERSIONS_URL, { data: result })
      if (action === "add") setName("")
      toast.success(action === "remove" ? `Removed ${version}` : `${version} is current. New runs get it from now on.`)
    } catch (err) {
      toast.error(errorText(err, "That didn’t save"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminSection
      title="Game versions"
      count={versions?.length}
      description="Every new run is stamped with the current one. Adding a version here makes it current. Owners can change a run’s version on its page, and a version no run has yet can be removed."
    >
      {error && !versions ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !versions ? <AdminLoading /> : null}
      {versions ? (
        <AdminCard>
          <form
            className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim()) void save("add", name.trim())
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New game update, like 1.4.0"
              maxLength={32}
              aria-label="New version"
              className="h-9 max-w-64 flex-1"
            />
            <Button type="submit" variant="outline" disabled={busy !== null || !name.trim()}>
              {busy === "" ? <Spinner className="size-4" /> : <PlusIcon />}
              Add as current
            </Button>
          </form>
          {versions.length === 0 ? (
            <p className="m-0 px-4 py-4 text-sm text-muted-foreground">No versions yet. Until there’s a current one, new runs have no version.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {versions.map((version) => (
                <li key={version.name} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className="flex min-w-48 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px]">
                      {version.name}
                      {version.is_current ? <span className="label-caps rounded-sm border border-primary px-1.5 text-[11px] text-primary">Current</span> : null}
                    </span>
                    <span className="text-[12px] text-subtle-foreground">
                      Added{version.created_by ? ` by ${version.created_by}` : ""}, {formatAgo(version.created_at, now)}
                    </span>
                  </span>
                  <span className="num text-[13px] text-muted-foreground">
                    {formatCount(version.run_count)} {version.run_count === 1 ? "run" : "runs"}
                  </span>
                  {version.is_current ? null : (
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void save("current", version.name)}>
                      {busy === `current:${version.name}` ? <Spinner className="size-4" /> : <CheckIcon />}
                      Make current
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || version.is_current || version.run_count > 0}
                    title={
                      version.is_current
                        ? "New runs get this version. Make another one current first."
                        : version.run_count > 0
                          ? "Runs have this version, so it stays"
                          : undefined
                    }
                    onClick={() => void save("remove", version.name)}
                  >
                    {busy === `remove:${version.name}` ? <Spinner className="size-4" /> : <Trash2Icon />}
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      ) : null}
    </AdminSection>
  )
}

function Video({ site, onChanged }: { site: SiteData; onChanged: () => void }) {
  const { video, backfill } = site
  const [starting, setStarting] = useState(false)
  const stats = [
    { label: "Processing now", value: formatCount(video.processing), sub: video.avg_seconds_24h === null ? "No videos in the last day" : `Average ${formatDuration(video.avg_seconds_24h)} over the last day`, alert: false },
    { label: "Failed, 7 days", value: formatCount(video.failed_7d), sub: "Players get a DM and a notice on the site", alert: video.failed_7d > 0 },
    { label: "Waiting on players", value: formatCount(video.failed_pending), sub: "Pending runs with a failed video", alert: false },
  ]

  const start = async () => {
    setStarting(true)
    try {
      await adminRequest("/admin/videos/backfill", { fallback: "Couldn’t start re-encoding" })
      toast.success("Re-encoding runs in the background")
      onChanged()
    } catch (err) {
      toast.error(errorText(err, "Couldn’t start re-encoding"))
    } finally {
      setStarting(false)
    }
  }

  return (
    <AdminSection title="Video processing">
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 bg-surface px-4 py-3.5">
            <span className="label-caps text-[13px] text-subtle-foreground">{stat.label}</span>
            <span className={cn("num text-[26px] font-semibold", stat.alert && "text-destructive")}>{stat.value}</span>
            <span className="text-[12px] text-muted-foreground">{stat.sub}</span>
          </div>
        ))}
      </div>
      <AdminCard className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
        <span className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-[15px]">Re-encode old videos</span>
          <span className="text-[13px] text-muted-foreground">
            Runs videos uploaded before server-side processing through it: re-encoded only if needed, and given a server-made thumbnail.{" "}
            {backfill.remaining === 0
              ? "Every video is done."
              : `${formatCount(backfill.remaining)} left${backfill.inFlight > 0 ? `, ${backfill.inFlight} processing now` : ""}.`}
            {backfill.failed > 0 ? ` ${formatCount(backfill.failed)} couldn’t be processed; their existing video is unchanged.` : ""}
          </span>
        </span>
        <Button variant="outline" onClick={() => void start()} disabled={starting || backfill.remaining === 0 || backfill.inFlight > 0}>
          {starting || backfill.inFlight > 0 ? <Spinner className="size-4" /> : null}
          {backfill.inFlight > 0 ? "Running" : backfill.started ? "Resume" : "Start"}
        </Button>
      </AdminCard>
    </AdminSection>
  )
}

function Maintenance({ site }: { site: SiteData }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<(typeof TOOLS)[number] | null>(null)
  const now = nowSeconds()

  const run = async (tool: (typeof TOOLS)[number]) => {
    setBusy(tool.action)
    try {
      const result = await adminRequest(tool.path, { fallback: `${tool.label} failed` })
      toast.success(tool.done(result))
      setConfirm(null)
      invalidateApi(SITE_URL)
    } catch (err) {
      toast.error(errorText(err, `${tool.label} failed`))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminSection title="Maintenance" description="One-off repairs for data that has drifted. Each one asks first.">
      <AdminCard>
        <ul className="m-0 list-none p-0">
          {TOOLS.map((tool) => (
            <li key={tool.action} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
              <span className="flex min-w-64 flex-1 flex-col gap-0.5">
                <span className="text-[15px]">{tool.label}</span>
                <span className="text-[13px] text-muted-foreground">{tool.help}</span>
              </span>
              <span className="text-[12px] text-subtle-foreground">{lastRunText(site.last_runs[tool.action], now)}</span>
              <Button variant="outline" onClick={() => setConfirm(tool)} disabled={busy !== null}>
                {busy === tool.action ? <Spinner className="size-4" /> : null}
                Run
              </Button>
            </li>
          ))}
          <li className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="flex min-w-64 flex-1 flex-col gap-0.5">
              <span className="text-[15px]">Set world record versions</span>
              <span className="text-[13px] text-muted-foreground">
                Goes through every world record without a version, one at a time like the review queue. Saving names its file in the archive.
              </span>
            </span>
            <Button asChild variant="outline">
              <Link href="/admin/site/wr-versions">Open</Link>
            </Button>
          </li>
        </ul>
      </AdminCard>
      <p className="m-0 text-[13px] text-muted-foreground">
        Trial changes past their grace period apply by themselves in the daily job at 06:00 UTC.
      </p>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm ? `${confirm.label}?` : ""}
        description={confirm?.confirm ?? ""}
        confirmLabel="Run"
        tone={confirm?.action === "duplicates_removed" ? "destructive" : "default"}
        busy={busy !== null}
        onConfirm={() => confirm && void run(confirm)}
      />
    </AdminSection>
  )
}
