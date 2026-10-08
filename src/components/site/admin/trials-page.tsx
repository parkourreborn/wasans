"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { GripVerticalIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { formatCount, formatDate, formatTime } from "@/lib/format"
import { trialHref } from "@/lib/trial-slug"
import { trials as knownTrials } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { invalidateApi, setApiData, useApi } from "@/hooks/use-api"
import { ConfirmDialog } from "@/components/site/moderation-dialogs"
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminSection,
  adminRequest,
  errorText,
  nowSeconds,
} from "@/components/site/admin/admin-kit"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TrialCombobox } from "@/components/site/trial-combobox"
import { Spinner } from "@/components/ui/spinner"

type TrialRow = {
  name: string
  status: "active" | "removed"
  added_at: number
  version: number
  version_changed_at: number | null
  removed_at: number | null
  sort_order: number
  pb_count: number
  wr_time: number | null
  wr_player_name: string | null
  wr_submission_uuid: string | null
}

// Mirrors TRIAL_GRACE_PERIOD_SECONDS in src/lib/server/trial-lifecycle.ts.
const GRACE = 7 * 86400
const TRIALS_URL = apiV2("/admin/trials")

type Pending = { trial: string; what: string; when: string; undo: { label: string; path: string; done: string } | null }

function pendingChanges(trials: TrialRow[], now: number): Pending[] {
  const out: Pending[] = []
  for (const trial of trials) {
    if (trial.status === "active" && now < trial.added_at + GRACE) {
      out.push({ trial: trial.name, what: "Added. Runs can be submitted now; it isn’t part of scores yet.", when: `Counts from ${formatDate(trial.added_at + GRACE)}`, undo: null })
    }
    if (trial.status === "removed" && trial.removed_at && now < trial.removed_at + GRACE) {
      out.push({
        trial: trial.name,
        what: "Retired. Takes no new runs, and still counts toward scores until then.",
        when: `Leaves scores ${formatDate(trial.removed_at + GRACE)}`,
        undo: { label: "Undo", path: `/admin/trials/${encodeURIComponent(trial.name)}/unretire`, done: `${trial.name} is active again` },
      })
    }
    if (trial.status === "active" && trial.version_changed_at && now < trial.version_changed_at + GRACE) {
      out.push({
        trial: trial.name,
        what: `Marked as changed (v${trial.version}). Runs on v${trial.version - 1} keep counting until then.`,
        when: `v${trial.version - 1} runs stop ${formatDate(trial.version_changed_at + GRACE)}`,
        undo: { label: "Undo", path: `/admin/trials/${encodeURIComponent(trial.name)}/unbump-version`, done: `${trial.name}’s version change was undone` },
      })
    }
  }
  return out
}

function statusOf(trial: TrialRow, now: number) {
  if (now < trial.added_at + GRACE) return { label: "New", className: "text-primary" }
  if (trial.version_changed_at && now < trial.version_changed_at + GRACE) return { label: "Changing", className: "text-[#69c1fc]" }
  return { label: "Active", className: "text-success" }
}

function refresh() {
  invalidateApi(TRIALS_URL)
  invalidateApi(apiV2("/trials"))
}

type Confirm = { title: string; description: string; label: string; tone: "destructive" | "default"; path: string; done: string }

export function AdminTrialsPage() {
  const { data, error, loading, refetch } = useApi<{ data: TrialRow[] }>(TRIALS_URL)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [adding, setAdding] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const trials = data?.data ?? []
  const now = nowSeconds()
  const active = trials.filter((trial) => trial.status === "active").sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const retired = trials.filter((trial) => trial.status === "removed").sort((a, b) => (b.removed_at ?? 0) - (a.removed_at ?? 0))
  const pending = pendingChanges(trials, now)
  const addable = knownTrials.filter((name) => !trials.some((trial) => trial.name === name))

  const run = async (path: string, done: string, key: string) => {
    setBusy(key)
    try {
      await adminRequest(path, { fallback: "That change didn’t save" })
      toast.success(done)
      setConfirm(null)
      refresh()
    } catch (err) {
      toast.error(errorText(err, "That change didn’t save"))
    } finally {
      setBusy(null)
    }
  }

  const reorder = async (names: string[]) => {
    // Show the new order straight away; put it back if the save fails.
    const previous = data
    const position = new Map(names.map((name, index) => [name, index]))
    setApiData(TRIALS_URL, {
      ...data,
      data: trials.map((trial) => (position.has(trial.name) ? { ...trial, sort_order: position.get(trial.name)! } : trial)),
    })
    try {
      await adminRequest("/admin/trials/reorder", { body: { names }, fallback: "Couldn’t save the order" })
      invalidateApi(apiV2("/trials"))
    } catch (err) {
      if (previous) setApiData(TRIALS_URL, previous)
      toast.error(errorText(err, "Couldn’t save the order"))
    }
  }

  const move = (name: string, to: number) => {
    const names = active.map((trial) => trial.name)
    const from = names.indexOf(name)
    if (from === -1 || to < 0 || to >= names.length || from === to) return
    names.splice(from, 1)
    names.splice(to, 0, name)
    void reorder(names)
  }

  return (
    <AdminPage
      title="Trials"
      description="Every change waits 7 days before it touches scores, and can be undone in that time. Drag rows to set the order the whole site uses."
      actions={
        <Button onClick={() => setAdding(true)} disabled={addable.length === 0} title={addable.length === 0 ? "Every trial in the code is already added" : undefined}>
          <PlusIcon className="size-4" strokeWidth={2.6} />
          Add trial
        </Button>
      }
    >
      {error && !data ? <AdminError message={error} onRetry={refetch} /> : null}
      {loading && !data ? <AdminLoading /> : null}

      {pending.length > 0 ? (
        <section aria-labelledby="pending-h" className="rounded-lg border border-[#69c1fc]/45 bg-[#69c1fc]/5">
          <h2 id="pending-h" className="label-caps px-4 pb-2 pt-3 text-[14px] text-[#69c1fc]">
            In their grace period
          </h2>
          <ul className="m-0 list-none p-0">
            {pending.map((item) => (
              <li key={`${item.trial}:${item.when}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#69c1fc]/20 px-4 py-2.5">
                <span className="min-w-28 text-[15px] font-medium">{item.trial}</span>
                <span className="min-w-56 flex-1 text-[13px] text-muted-foreground">{item.what}</span>
                <span className="num text-[13px]">{item.when}</span>
                {item.undo ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === item.undo.path}
                    onClick={() => void run(item.undo!.path, item.undo!.done, item.undo!.path)}
                  >
                    {busy === item.undo.path ? <Spinner className="size-3.5" /> : null}
                    {item.undo.label}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="label-caps h-9 border-b border-line text-[13px] text-subtle-foreground">
                <th className="w-8 font-semibold" aria-label="Reorder" />
                <th className="w-9 font-semibold">#</th>
                <th className="font-semibold">Trial</th>
                <th className="w-28 font-semibold">Status</th>
                <th className="w-48 font-semibold">Version</th>
                <th className="w-20 text-right font-semibold">PBs</th>
                <th className="w-40 text-right font-semibold">WR</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {active.map((trial, index) => {
                const status = statusOf(trial, now)
                return (
                  <tr
                    key={trial.name}
                    draggable
                    onDragStart={(event) => {
                      setDragging(trial.name)
                      event.dataTransfer.effectAllowed = "move"
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragging) move(dragging, index)
                      setDragging(null)
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn("h-12 border-b border-line", dragging === trial.name && "opacity-40")}
                  >
                    <td className="cursor-grab text-subtle-foreground" aria-hidden>
                      <GripVerticalIcon className="size-4" />
                    </td>
                    <td className="num text-[13px] text-subtle-foreground">{index + 1}</td>
                    <td>
                      <Link href={trialHref(trial.name)} className="text-[15px] font-medium hover:underline">
                        {trial.name}
                      </Link>
                    </td>
                    <td className={cn("label-caps text-[13px]", status.className)}>{status.label}</td>
                    <td className="text-[13px] text-muted-foreground">
                      <span className="num text-foreground">v{trial.version}</span>
                      {trial.version_changed_at ? ` changed ${formatDate(trial.version_changed_at)}` : null}
                    </td>
                    <td className="num text-right text-[13px] text-muted-foreground">{formatCount(Number(trial.pb_count))}</td>
                    <td className="text-right text-[13px]">
                      {trial.wr_time === null ? (
                        <span className="text-subtle-foreground">None</span>
                      ) : (
                        <span className="flex flex-col items-end leading-tight">
                          <span className="num text-gold">{formatTime(trial.wr_time)}</span>
                          <span className="truncate text-[12px] text-muted-foreground">{trial.wr_player_name}</span>
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="outline" aria-label={`Actions for ${trial.name}`} disabled={busy === trial.name}>
                            {busy === trial.name ? <Spinner className="size-3.5" /> : <MoreHorizontalIcon className="size-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72 border border-line-strong bg-surface-2 p-1.5">
                          <DropdownMenuItem
                            className="flex flex-col items-start gap-0.5 px-2.5 py-2"
                            onSelect={() =>
                              setConfirm({
                                title: `Mark ${trial.name} as changed?`,
                                description: `It becomes v${trial.version + 1}. Runs on v${trial.version} keep counting for 7 days, then only new runs count. You can undo it until then.`,
                                label: "Mark changed",
                                tone: "default",
                                path: `/admin/trials/${encodeURIComponent(trial.name)}/bump-version`,
                                done: `${trial.name} marked as changed`,
                              })
                            }
                          >
                            The map changed
                            <span className="text-[12px] text-muted-foreground">New version: older runs stop counting in 7 days</span>
                          </DropdownMenuItem>
                          {trial.version > 1 ? (
                            <DropdownMenuItem
                              className="px-2.5 py-2"
                              onSelect={() =>
                                setConfirm({
                                  title: `Go back to v${trial.version - 1} of ${trial.name}?`,
                                  description: `Runs submitted on v${trial.version} are moved back to v${trial.version - 1}.`,
                                  label: "Undo change",
                                  tone: "default",
                                  path: `/admin/trials/${encodeURIComponent(trial.name)}/unbump-version`,
                                  done: `${trial.name}’s version change was undone`,
                                })
                              }
                            >
                              Undo the last version change
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator className="bg-line" />
                          <DropdownMenuItem className="px-2.5 py-2" disabled={index === 0} onSelect={() => move(trial.name, index - 1)}>
                            Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem className="px-2.5 py-2" disabled={index === active.length - 1} onSelect={() => move(trial.name, index + 1)}>
                            Move down
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="px-2.5 py-2">
                            <Link href={trialHref(trial.name)}>Open the trial page</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-line" />
                          <DropdownMenuItem
                            className="flex flex-col items-start gap-0.5 px-2.5 py-2 text-destructive focus:text-destructive"
                            onSelect={() =>
                              setConfirm({
                                title: `Retire ${trial.name}?`,
                                description: "It stops taking runs now and leaves everyone’s score in 7 days. You can bring it back at any time.",
                                label: "Retire",
                                tone: "destructive",
                                path: `/admin/trials/${encodeURIComponent(trial.name)}/retire`,
                                done: `${trial.name} retired`,
                              })
                            }
                          >
                            Retire
                            <span className="text-[12px] text-muted-foreground">Stops taking runs now; leaves scores in 7 days</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {active.length === 0 ? <AdminEmpty>No active trials.</AdminEmpty> : null}
        </div>
      ) : null}

      {retired.length > 0 ? (
        <AdminSection title="Retired" count={retired.length}>
          <ul className="m-0 list-none rounded-lg border border-line bg-surface p-0">
            {retired.map((trial) => {
              const inGrace = trial.removed_at !== null && now < trial.removed_at + GRACE
              const key = `unretire:${trial.name}`
              return (
                <li key={trial.name} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 text-[15px]">{trial.name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    Retired {formatDate(trial.removed_at)} · v{trial.version}
                    {inGrace ? " · still counting" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === key}
                    onClick={() => void run(`/admin/trials/${encodeURIComponent(trial.name)}/unretire`, `${trial.name} is active again`, key)}
                  >
                    {busy === key ? <Spinner className="size-3.5" /> : null}
                    Bring back
                  </Button>
                </li>
              )
            })}
          </ul>
        </AdminSection>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.label ?? ""}
        tone={confirm?.tone}
        busy={busy !== null}
        onConfirm={() => confirm && void run(confirm.path, confirm.done, confirm.path)}
      />

      <AddTrialDialog open={adding} onOpenChange={setAdding} names={addable} />
    </AdminPage>
  )
}

function AddTrialDialog({ open, onOpenChange, names }: { open: boolean; onOpenChange: (open: boolean) => void; names: readonly string[] }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const now = nowSeconds()

  const add = async () => {
    if (!name) return
    setBusy(true)
    try {
      await adminRequest("/admin/trials", { body: { name }, fallback: "Couldn’t add that trial" })
      toast.success(`${name} added. It counts toward scores from ${formatDate(now + GRACE)}.`)
      refresh()
      setName("")
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, "Couldn’t add that trial"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-line-strong bg-surface-2 sm:max-w-md">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="font-display text-[26px] font-extrabold uppercase leading-none">Add a trial</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Players can submit runs straight away. It joins everyone’s score in 7 days, on {formatDate(now + GRACE)}.
          </DialogDescription>
        </DialogHeader>
        <TrialCombobox trials={names} value={name} onValueChange={setName} aria-label="Trial" />
        <p className="text-[13px] text-muted-foreground">
          Only trials with score thresholds in the code are listed. A new trial needs a deploy first.
        </p>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={!name || busy}>
            {busy ? <Spinner className="size-4" /> : null}
            Add trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
