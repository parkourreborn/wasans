"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import {
  CRITERIA_LABELS,
  fetchGiveaways,
  fetchPrizeCandidates,
  fetchPrizes,
  formatDeadline,
  formatUntil,
  fromDatetimeLocal,
  howToWin,
  spotsLabel,
  toDatetimeLocal,
  type Giveaway,
  type Prize,
  type PrizeCandidate,
  type PrizeCriteriaType,
  type PrizeStatus,
  type PrizeWinner,
} from "@/lib/prizes"
import { cn } from "@/lib/utils"
import { useComboCategories } from "@/hooks/use-combo-categories"
import { useTrialOrder } from "@/hooks/use-trial-order"
import { ConfirmDialog } from "@/components/site/moderation-dialogs"
import { PlayerPicker, type PickedPlayer } from "@/components/site/player-picker"
import { TrialCombobox } from "@/components/site/trial-combobox"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type Data = {
  prizes: Prize[]
  giveaways: Giveaway[]
  candidates: PrizeCandidate[]
}

const STATUS_ORDER: Record<PrizeStatus, number> = { active: 0, won: 1, closed: 2 }

const byStatusThenNewest = <T extends { status: PrizeStatus; created_at: number }>(a: T, b: T) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.created_at - a.created_at

// Every write here goes through this, so the page reloads afterwards and the
// nav badges (prize candidates) catch up.
async function run(action: () => Promise<unknown>, success: string, failure: string, reload: () => void) {
  try {
    await action()
    toast.success(success)
    reload()
    return true
  } catch (error) {
    toast.error(errorText(error, failure))
    return false
  }
}

export function AdminPrizesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState<"prize" | "giveaway" | null>(null)
  const reload = () => setAttempt((value) => value + 1)
  const now = nowSeconds()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPrizes("active"),
      fetchPrizes("history"),
      fetchGiveaways("active"),
      fetchGiveaways("history"),
      fetchPrizeCandidates(),
    ])
      .then(([activePrizes, pastPrizes, activeGiveaways, pastGiveaways, candidates]) => {
        if (cancelled) return
        setData({
          prizes: [...activePrizes, ...pastPrizes].sort(byStatusThenNewest),
          giveaways: [...activeGiveaways, ...pastGiveaways].sort(byStatusThenNewest),
          candidates,
        })
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, "Couldn't load prizes."))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const unclaimed = data
    ? [
        ...data.giveaways.flatMap((giveaway) =>
          giveaway.winners.filter((winner) => !winner.claimed).map((winner) => ({ winner, kind: "Giveaway", title: giveaway.title, at: winner.drawn_at, path: "giveaways" as const }))
        ),
        ...data.prizes.flatMap((prize) =>
          prize.winners.filter((winner) => !winner.claimed).map((winner) => ({ winner, kind: CRITERIA_LABELS[prize.criteria_type], title: prize.title, at: winner.awarded_at, path: "prizes" as const }))
        ),
      ].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    : []

  return (
    <AdminPage
      title="Prizes"
      description={
        <>
          Make prizes and giveaways, confirm the winners the site detects, and keep track of who still needs their reward. Players see
          them on <Link href="/prizes" className="underline underline-offset-4">Prizes</Link>.
        </>
      }
      actions={
        <>
          <Button onClick={() => setCreating("giveaway")}>
            <PlusIcon />
            New giveaway
          </Button>
          <Button variant="outline" onClick={() => setCreating("prize")}>
            <PlusIcon />
            New prize
          </Button>
        </>
      }
    >
      <CreateGiveawayDialog open={creating === "giveaway"} onOpenChange={(open) => setCreating(open ? "giveaway" : null)} onCreated={reload} />
      <CreatePrizeDialog open={creating === "prize"} onOpenChange={(open) => setCreating(open ? "prize" : null)} onCreated={reload} />

      {error && !data ? <AdminError message={error} onRetry={reload} /> : null}
      {!data && !error ? <AdminLoading label="Loading prizes" /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
            {[
              { label: "To confirm", value: data.candidates.length, alert: data.candidates.length > 0, href: "#section-to-confirm" },
              { label: "Unclaimed winners", value: unclaimed.length, alert: unclaimed.length > 0, href: "#section-unclaimed-winners" },
              { label: "Live giveaways", value: data.giveaways.filter((item) => item.status === "active").length, alert: false, href: "#section-giveaways" },
              { label: "Live prizes", value: data.prizes.filter((item) => item.status === "active").length, alert: false, href: "#section-prizes" },
            ].map((stat) => (
              <a key={stat.label} href={stat.href} className="flex flex-col gap-1 bg-surface px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="label-caps text-[13px] text-subtle-foreground">{stat.label}</span>
                <span className={cn("num text-[28px] font-semibold leading-none", stat.alert && "text-primary")}>{stat.value}</span>
              </a>
            ))}
          </div>

          <AdminSection
            title="To confirm"
            count={data.candidates.length}
            description="Players the site saw hitting a prize's goal. Confirm to make them a winner, or reject if the run doesn't count."
          >
            {data.candidates.length === 0 ? (
              <AdminEmpty>Nothing to confirm.</AdminEmpty>
            ) : (
              <AdminCard className="divide-y divide-line">
                {data.candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.uuid}
                    candidate={candidate}
                    prize={data.prizes.find((prize) => prize.uuid === candidate.prize_uuid)}
                    now={now}
                    reload={reload}
                  />
                ))}
              </AdminCard>
            )}
          </AdminSection>

          <AdminSection
            title="Unclaimed winners"
            count={unclaimed.length}
            description="Winners who haven't had their reward yet, oldest first. Mark them claimed once they have it."
          >
            {unclaimed.length === 0 ? (
              <AdminEmpty>Every winner has their reward.</AdminEmpty>
            ) : (
              <AdminCard className="divide-y divide-line">
                {unclaimed.map(({ winner, kind, title, at, path }) => (
                  <div key={winner.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px]">
                        <PlayerLink winner={winner} /> <span className="text-muted-foreground">won</span> {title}
                      </span>
                      <span className="text-[13px] text-subtle-foreground">
                        <span className="label-caps">{kind}</span>
                        {at ? ` · ${formatAgo(at, now)}` : ""}
                      </span>
                    </div>
                    <ClaimButton winner={winner} path={path} reload={reload} />
                  </div>
                ))}
              </AdminCard>
            )}
          </AdminSection>

          <AdminSection title="Giveaways" count={data.giveaways.length} description="Anyone logged in can join until the deadline. Winners are drawn automatically when it passes, or draw early yourself.">
            <ItemList
              items={data.giveaways}
              empty="No giveaways yet."
              render={(giveaway) => <GiveawayCard key={giveaway.uuid} giveaway={giveaway} now={now} reload={reload} />}
            />
          </AdminSection>

          <AdminSection title="Prizes" count={data.prizes.length} description="Won by hitting a goal. The site detects it and asks you to confirm under To confirm, or add a winner yourself.">
            <ItemList
              items={data.prizes}
              empty="No prizes yet."
              render={(prize) => <PrizeCard key={prize.uuid} prize={prize} now={now} reload={reload} />}
            />
          </AdminSection>
        </>
      ) : null}
    </AdminPage>
  )
}

// Live and drawn ones in full; closed ones folded away underneath.
function ItemList<T extends { status: PrizeStatus }>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) {
  const open = items.filter((item) => item.status !== "closed")
  const closed = items.filter((item) => item.status === "closed")
  if (items.length === 0) return <AdminEmpty>{empty}</AdminEmpty>
  return (
    <div className="flex flex-col gap-3">
      {open.map(render)}
      {open.length === 0 ? <AdminEmpty>Nothing running. Closed ones are below.</AdminEmpty> : null}
      {closed.length > 0 ? (
        <details className="group">
          <summary className="label-caps cursor-pointer list-none py-1 text-[14px] text-muted-foreground marker:hidden hover:text-foreground">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> {closed.length} closed
          </summary>
          <div className="mt-3 flex flex-col gap-3">{closed.map(render)}</div>
        </details>
      ) : null}
    </div>
  )
}

function PlayerLink({ winner }: { winner: { player_uuid: string; player_name: string } }) {
  return (
    <Link href={`/players/${encodeURIComponent(winner.player_uuid)}`} className="font-medium underline-offset-4 hover:underline">
      {winner.player_name}
    </Link>
  )
}

function StatusLabel({ status, endsAt, now }: { status: PrizeStatus; endsAt: number | null; now: number }) {
  if (status === "won") return <span className="label-caps text-[13px] text-gold">Won</span>
  if (status === "closed") return <span className="label-caps text-[13px] text-subtle-foreground">Closed</span>
  return (
    <span className="text-[13px] text-muted-foreground" title={endsAt ? formatDeadline(endsAt) : undefined}>
      <span className="label-caps text-success">Live</span>
      {endsAt ? (
        <>
          {" "}
          · ends <span className="num">{formatUntil(endsAt, now)}</span>
        </>
      ) : (
        " · no deadline"
      )}
    </span>
  )
}

function CandidateRow({ candidate, prize, now, reload }: { candidate: PrizeCandidate; prize?: Prize; now: number; reload: () => void }) {
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null)
  const review = async (action: "confirm" | "reject") => {
    setBusy(action)
    await run(
      () => adminRequest(`/prize-candidates/${candidate.uuid}/${action}`),
      action === "confirm" ? `${candidate.player_name} is now a winner.` : "Rejected.",
      `Couldn't ${action} that.`,
      reload
    )
    setBusy(null)
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px]">
          <PlayerLink winner={candidate} /> <span className="text-muted-foreground">for</span> {prize?.title ?? "a prize"}
        </span>
        <span className="text-[13px] text-subtle-foreground">
          Detected {formatAgo(candidate.detected_at, now)}
          {candidate.event_details ? ` · ${candidate.event_details}` : ""}
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void review("confirm")} disabled={busy !== null}>
          {busy === "confirm" ? <Spinner className="size-3.5" /> : <CheckIcon />}
          Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={() => void review("reject")} disabled={busy !== null}>
          {busy === "reject" ? <Spinner className="size-3.5" /> : <XIcon />}
          Reject
        </Button>
      </div>
    </div>
  )
}

function ClaimButton({ winner, path, reload }: { winner: PrizeWinner; path: "prizes" | "giveaways"; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const claimed = Boolean(winner.claimed)
  return (
    <Button
      size="sm"
      variant={claimed ? "ghost" : "outline"}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await run(
          () => adminRequest(`/${path}/winners/${winner.uuid}/claim`, { method: "PATCH", body: { claimed: !claimed } }),
          claimed ? `${winner.player_name} marked unclaimed.` : `${winner.player_name} marked claimed.`,
          "Couldn't update that.",
          reload
        )
        setBusy(false)
      }}
      className={cn(claimed && "text-success")}
    >
      {busy ? <Spinner className="size-3.5" /> : claimed ? <CheckIcon /> : null}
      {claimed ? "Claimed" : "Mark claimed"}
    </Button>
  )
}

type PendingAction = { label: string; title: string; description: string; tone: "default" | "destructive"; path: string; success: string }

function ManageCard({
  kind,
  title,
  description,
  status,
  endsAt,
  now,
  meta,
  actions,
  children,
}: {
  kind: string
  title: string
  description: string | null
  status: PrizeStatus
  endsAt: number | null
  now: number
  meta: React.ReactNode
  actions: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AdminCard className={cn(status === "closed" && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label-caps text-[13px] text-primary">{kind}</span>
            <StatusLabel status={status} endsAt={endsAt} now={now} />
          </span>
          <h3 className="font-display text-[22px] font-extrabold uppercase leading-none">{title}</h3>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          <p className="text-[13px] text-subtle-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </AdminCard>
  )
}

function WinnerRows({ winners, path, reload, onRemove }: { winners: PrizeWinner[]; path: "prizes" | "giveaways"; reload: () => void; onRemove?: (winner: PrizeWinner) => void }) {
  if (winners.length === 0) return <p className="text-sm text-subtle-foreground">No winners yet.</p>
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0">
      {winners.map((winner) => (
        <li key={winner.uuid} className="flex items-center gap-3 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[15px]">
            <PlayerLink winner={winner} />
            {winner.source === "manual" ? <span className="text-[13px] text-subtle-foreground"> · added by hand</span> : null}
          </span>
          <ClaimButton winner={winner} path={path} reload={reload} />
          {onRemove ? (
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${winner.player_name} as a winner`} onClick={() => onRemove(winner)}>
              <XIcon />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function useConfirmAction(reload: () => void) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setPending(null)
      }}
      title={pending?.title ?? ""}
      description={pending?.description ?? ""}
      confirmLabel={pending?.label ?? ""}
      tone={pending?.tone ?? "default"}
      busy={busy}
      onConfirm={async () => {
        if (!pending) return
        setBusy(true)
        const ok = await run(() => adminRequest(pending.path), pending.success, `Couldn't ${pending.label.toLowerCase()}.`, reload)
        setBusy(false)
        if (ok) setPending(null)
      }}
    />
  )
  return { ask: setPending, dialog }
}

function GiveawayCard({ giveaway, now, reload }: { giveaway: Giveaway; now: number; reload: () => void }) {
  const { ask, dialog } = useConfirmAction(reload)
  const [extending, setExtending] = useState(false)
  const unclaimed = giveaway.winners.filter((winner) => !winner.claimed).length

  return (
    <ManageCard
      kind="Giveaway"
      title={giveaway.title}
      description={giveaway.description}
      status={giveaway.status}
      endsAt={giveaway.ends_at}
      now={now}
      meta={
        <>
          <span className="num">{giveaway.entry_count}</span> joined · {spotsLabel(giveaway.winners.length, giveaway.max_winners)}
        </>
      }
      actions={
        <>
          {giveaway.status === "active" ? (
            <Button
              size="sm"
              onClick={() =>
                ask({
                  label: "Draw now",
                  title: "Draw winners now?",
                  description: `Picks ${giveaway.max_winners} at random from the ${giveaway.entry_count} ${giveaway.entry_count === 1 ? "player" : "players"} who joined, and ends the giveaway.`,
                  tone: "default",
                  path: `/giveaways/${giveaway.uuid}/draw`,
                  success: "Winners drawn.",
                })
              }
            >
              Draw now
            </Button>
          ) : null}
          {giveaway.status === "won" && unclaimed > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ask({
                  label: "Reroll",
                  title: "Reroll unclaimed winners?",
                  description: `The ${unclaimed} ${unclaimed === 1 ? "winner who hasn't" : "winners who haven't"} claimed ${unclaimed === 1 ? "is" : "are"} replaced with new random picks. Claimed winners stay.`,
                  tone: "default",
                  path: `/giveaways/${giveaway.uuid}/reroll`,
                  success: "Rerolled.",
                })
              }
            >
              Reroll unclaimed
            </Button>
          ) : null}
          {giveaway.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => setExtending(true)}>
              Change deadline
            </Button>
          ) : null}
          {giveaway.status !== "closed" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                ask({
                  label: "Close",
                  title: "Close this giveaway?",
                  description: "Nobody else can join, and no more winners are drawn. Winners already drawn keep their spot.",
                  tone: "destructive",
                  path: `/giveaways/${giveaway.uuid}/close`,
                  success: "Giveaway closed.",
                })
              }
            >
              Close
            </Button>
          ) : null}
        </>
      }
    >
      <WinnerRows winners={giveaway.winners} path="giveaways" reload={reload} />
      {dialog}
      <DeadlineDialog
        open={extending}
        onOpenChange={setExtending}
        title={`Deadline for ${giveaway.title}`}
        current={giveaway.ends_at}
        allowNone={false}
        path={`/giveaways/${giveaway.uuid}/extend`}
        reload={reload}
      />
    </ManageCard>
  )
}

function PrizeCard({ prize, now, reload }: { prize: Prize; now: number; reload: () => void }) {
  const { ask, dialog } = useConfirmAction(reload)
  const { categories } = useComboCategories()
  const [extending, setExtending] = useState(false)
  const [adding, setAdding] = useState<PickedPlayer | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [removing, setRemoving] = useState<PrizeWinner | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const full = prize.max_winners != null && prize.winners.length >= prize.max_winners

  return (
    <ManageCard
      kind={CRITERIA_LABELS[prize.criteria_type]}
      title={prize.title}
      description={prize.description}
      status={prize.status}
      endsAt={prize.ends_at}
      now={now}
      meta={
        <>
          {howToWin(prize, (slug) => categories.find((category) => category.slug === slug)?.label)} · {spotsLabel(prize.winners.length, prize.max_winners)}
        </>
      }
      actions={
        prize.status !== "closed" ? (
          <>
            {prize.status === "active" ? (
              <Button size="sm" variant="outline" onClick={() => setExtending(true)}>
                Change deadline
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                ask({
                  label: "Close",
                  title: "Close this prize?",
                  description: "No more winners are detected or added. Existing winners keep it.",
                  tone: "destructive",
                  path: `/prizes/${prize.uuid}/close`,
                  success: "Prize closed.",
                })
              }
            >
              Close
            </Button>
          </>
        ) : null
      }
    >
      <WinnerRows winners={prize.winners} path="prizes" reload={reload} onRemove={prize.status === "closed" ? undefined : setRemoving} />
      {prize.status !== "closed" && !full ? (
        <div className="flex flex-wrap items-center gap-2">
          <PlayerPicker value={adding} onChange={setAdding} placeholder="Add a winner by hand" label="Winner to add" clearable />
          <Button
            size="sm"
            variant="outline"
            disabled={!adding || addBusy}
            onClick={async () => {
              if (!adding) return
              setAddBusy(true)
              const ok = await run(
                () => adminRequest(`/prizes/${prize.uuid}/winners`, { body: { player_uuid: adding.uuid } }),
                `${adding.player_name} added as a winner.`,
                "Couldn't add that winner.",
                reload
              )
              setAddBusy(false)
              if (ok) setAdding(null)
            }}
          >
            {addBusy ? <Spinner className="size-3.5" /> : <PlusIcon />}
            Add winner
          </Button>
        </div>
      ) : null}
      {dialog}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(null)
        }}
        title="Remove this winner?"
        description={removing ? `${removing.player_name} stops being a winner of ${prize.title}, and their spot opens up again.` : ""}
        confirmLabel="Remove"
        busy={removeBusy}
        onConfirm={async () => {
          if (!removing) return
          setRemoveBusy(true)
          const ok = await run(
            () => adminRequest(`/prizes/winners/${removing.uuid}`, { method: "DELETE" }),
            "Winner removed.",
            "Couldn't remove that winner.",
            reload
          )
          setRemoveBusy(false)
          if (ok) setRemoving(null)
        }}
      />
      <DeadlineDialog
        open={extending}
        onOpenChange={setExtending}
        title={`Deadline for ${prize.title}`}
        current={prize.ends_at}
        allowNone
        path={`/prizes/${prize.uuid}/extend`}
        reload={reload}
      />
    </ManageCard>
  )
}

// ----- Forms -----

const dialogClass = "max-h-[calc(100svh-2rem)] overflow-y-auto border-line-strong bg-surface-2 sm:max-w-lg"
const dialogTitleClass = "font-display text-[26px] font-extrabold uppercase leading-none"
const footerClass = "-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4"
const fieldLabelClass = "label-caps text-[13px] text-subtle-foreground"

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[13px] text-subtle-foreground">{hint}</p> : null}
    </div>
  )
}

const DEADLINE_PRESETS = [
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 3 * 86400 },
  { label: "1 week", seconds: 7 * 86400 },
  { label: "2 weeks", seconds: 14 * 86400 },
]

// Quick picks for the usual lengths, plus an exact date and time. "" means
// no deadline, where that's allowed.
function DeadlineField({ id, value, onChange, allowNone }: { id: string; value: string; onChange: (value: string) => void; allowNone: boolean }) {
  return (
    <Field label="Deadline" htmlFor={id} hint={value ? `Ends ${formatDeadline(fromDatetimeLocal(value) ?? 0)}, your time.` : allowNone ? "Runs until you close it." : undefined}>
      <div className="flex flex-wrap gap-1.5">
        {allowNone ? (
          <PresetButton active={value === ""} onClick={() => onChange("")}>
            No deadline
          </PresetButton>
        ) : null}
        {DEADLINE_PRESETS.map((preset) => (
          <PresetButton key={preset.label} active={false} onClick={() => onChange(toDatetimeLocal(nowSeconds() + preset.seconds))}>
            {preset.label}
          </PresetButton>
        ))}
      </div>
      <Input id={id} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-10" />
    </Field>
  )
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "label-caps h-8 rounded-md border px-2.5 text-[13px] transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function DeadlineDialog({
  open,
  onOpenChange,
  title,
  current,
  allowNone,
  path,
  reload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  current: number | null
  allowNone: boolean
  path: string
  reload: () => void
}) {
  const [value, setValue] = useState(current ? toDatetimeLocal(current) : "")
  const [busy, setBusy] = useState(false)
  const endsAt = fromDatetimeLocal(value)
  const valid = allowNone ? value === "" || endsAt !== null : endsAt !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(current ? toDatetimeLocal(current) : "")
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className={dialogClass}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className={dialogTitleClass}>{title}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            {current ? `Currently ends ${formatDeadline(current)}.` : "Currently has no deadline."}
          </DialogDescription>
        </DialogHeader>
        <DeadlineField id="deadline-edit" value={value} onChange={setValue} allowNone={allowNone} />
        <DialogFooter className={footerClass}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true)
              const ok = await run(() => adminRequest(path, { method: "PATCH", body: { ends_at: endsAt } }), "Deadline updated.", "Couldn't change the deadline.", reload)
              setBusy(false)
              if (ok) onOpenChange(false)
            }}
          >
            {busy ? <Spinner className="size-4" /> : null}
            Save deadline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateGiveawayDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [winners, setWinners] = useState("1")
  const [deadline, setDeadline] = useState(() => toDatetimeLocal(nowSeconds() + 7 * 86400))
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)

  const winnerCount = /^\d+$/.test(winners) ? Number(winners) : 0
  const endsAt = fromDatetimeLocal(deadline)
  const issues = {
    title: title.trim() ? null : "Give it a title.",
    winners: winnerCount >= 1 ? null : "At least 1 winner.",
    deadline: endsAt === null ? "Pick when it ends." : endsAt <= nowSeconds() ? "The deadline has to be in the future." : null,
  }
  const ready = !issues.title && !issues.winners && !issues.deadline

  const reset = () => {
    setTitle("")
    setDescription("")
    setWinners("1")
    setDeadline(toDatetimeLocal(nowSeconds() + 7 * 86400))
    setAttempted(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={dialogClass}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className={dialogTitleClass}>New giveaway</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Players join from the Prizes page. When the deadline passes, winners are drawn at random and get a Discord message.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="giveaway-title">
            <Input id="giveaway-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="1,000 Robux" className="h-10" aria-invalid={Boolean(attempted && issues.title)} />
            {attempted && issues.title ? <p className="text-[13px] text-destructive">{issues.title}</p> : null}
          </Field>
          <Field label="Description" htmlFor="giveaway-description" hint="Optional. What they win, and anything else to know.">
            <Textarea id="giveaway-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </Field>
          <Field label="Winners" htmlFor="giveaway-winners">
            <Input
              id="giveaway-winners"
              inputMode="numeric"
              value={winners}
              onChange={(event) => /^\d{0,3}$/.test(event.target.value) && setWinners(event.target.value)}
              className="num h-10 w-28"
              aria-invalid={Boolean(attempted && issues.winners)}
            />
            {attempted && issues.winners ? <p className="text-[13px] text-destructive">{issues.winners}</p> : null}
          </Field>
          <DeadlineField id="giveaway-deadline" value={deadline} onChange={setDeadline} allowNone={false} />
          {attempted && issues.deadline ? <p className="-mt-2 text-[13px] text-destructive">{issues.deadline}</p> : null}
        </div>
        <DialogFooter className={footerClass}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setAttempted(true)
              if (!ready) return
              setBusy(true)
              const ok = await run(
                () =>
                  adminRequest("/giveaways", {
                    body: { title: title.trim(), description: description.trim() || null, max_winners: winnerCount, ends_at: endsAt },
                  }),
                "Giveaway is live.",
                "Couldn't create the giveaway.",
                onCreated
              )
              setBusy(false)
              if (ok) {
                reset()
                onOpenChange(false)
              }
            }}
          >
            {busy ? <Spinner className="size-4" /> : null}
            Start giveaway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const CRITERIA_OPTIONS: Array<{ value: PrizeCriteriaType; hint: string }> = [
  { value: "trial_wr", hint: "A new world record on a trial" },
  { value: "combo_wr", hint: "Taking #1 on a combo leaderboard" },
  { value: "score_reached", hint: "Reaching a score" },
  { value: "rankup", hint: "Ranking up into a new tier" },
]

function CreatePrizeDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const { orderedTrialNames, removedTrials } = useTrialOrder()
  const { categories } = useComboCategories()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [criteria, setCriteria] = useState<PrizeCriteriaType>("trial_wr")
  const [trial, setTrial] = useState("")
  const [category, setCategory] = useState("")
  const [roleId, setRoleId] = useState("")
  const [target, setTarget] = useState("")
  const [maxWinners, setMaxWinners] = useState("1")
  const [deadline, setDeadline] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)

  const targetValue = /^(0(\.\d{1,3})?|1(\.0{1,3})?)$/.test(target) ? Number(target) : null
  const endsAt = fromDatetimeLocal(deadline)
  const issues = {
    title: title.trim() ? null : "Give it a title.",
    target: criteria !== "score_reached" || (targetValue !== null && targetValue > 0) ? null : "A score between 0.001 and 1.000.",
    maxWinners: maxWinners === "" || Number(maxWinners) >= 1 ? null : "At least 1, or leave it blank for no limit.",
    deadline: deadline === "" || (endsAt !== null && endsAt > nowSeconds()) ? null : "The deadline has to be in the future.",
  }
  const ready = Object.values(issues).every((issue) => !issue)
  const preview = howToWin(
    {
      criteria_type: criteria,
      criteria_trial_name: trial || null,
      criteria_combo_category_slug: category || null,
      criteria_score_target: targetValue,
    },
    (slug) => categories.find((item) => item.slug === slug)?.label
  )

  const reset = () => {
    setTitle("")
    setDescription("")
    setCriteria("trial_wr")
    setTrial("")
    setCategory("")
    setRoleId("")
    setTarget("")
    setMaxWinners("1")
    setDeadline("")
    setAttempted(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={dialogClass}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className={dialogTitleClass}>New prize</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Won by hitting a goal. When someone does, they show up under To confirm for you to approve.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="prize-title">
            <Input id="prize-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Glass WR bounty" className="h-10" aria-invalid={Boolean(attempted && issues.title)} />
            {attempted && issues.title ? <p className="text-[13px] text-destructive">{issues.title}</p> : null}
          </Field>
          <Field label="Description" htmlFor="prize-description" hint="Optional. What they win, and anything else to know.">
            <Textarea id="prize-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
          </Field>

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className={cn(fieldLabelClass, "mb-1.5")}>Won by</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CRITERIA_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={criteria === option.value}
                  onClick={() => setCriteria(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                    criteria === option.value ? "border-primary bg-primary/10" : "border-line-strong hover:border-[#5a5a5a]"
                  )}
                >
                  <span className="label-caps text-[14px]">{CRITERIA_LABELS[option.value]}</span>
                  <span className="text-[13px] text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {criteria === "trial_wr" ? (
            <Field label="Trial" htmlFor="prize-trial">
              <TrialCombobox
                id="prize-trial"
                trials={orderedTrialNames.filter((name) => !removedTrials.has(name))}
                value={trial}
                onValueChange={setTrial}
                anyLabel="Any trial"
                placeholder="Any trial"
              />
            </Field>
          ) : null}
          {criteria === "combo_wr" ? (
            <Field label="Combo category" htmlFor="prize-category">
              <Select value={category || "__any"} onValueChange={(value) => setCategory(value === "__any" ? "" : value)}>
                <SelectTrigger id="prize-category" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any category</SelectItem>
                  {categories.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {criteria === "score_reached" ? (
            <Field label="Score to reach" htmlFor="prize-target">
              <Input
                id="prize-target"
                inputMode="decimal"
                placeholder="0.500"
                value={target}
                onChange={(event) => /^\d?(\.\d{0,3})?$/.test(event.target.value) && setTarget(event.target.value)}
                className="num h-10 w-32"
                aria-invalid={Boolean(attempted && issues.target)}
              />
              {attempted && issues.target ? <p className="text-[13px] text-destructive">{issues.target}</p> : null}
            </Field>
          ) : null}
          {criteria === "rankup" ? (
            <Field label="Discord role ID" htmlFor="prize-role" hint="Optional. Leave blank to count any rank up.">
              <Input id="prize-role" inputMode="numeric" value={roleId} onChange={(event) => setRoleId(event.target.value)} className="num h-10" />
            </Field>
          ) : null}

          <Field label="Winners" htmlFor="prize-max" hint="How many players can win it. Leave blank for no limit.">
            <Input
              id="prize-max"
              inputMode="numeric"
              value={maxWinners}
              onChange={(event) => /^\d{0,3}$/.test(event.target.value) && setMaxWinners(event.target.value)}
              placeholder="No limit"
              className="num h-10 w-28"
              aria-invalid={Boolean(attempted && issues.maxWinners)}
            />
            {attempted && issues.maxWinners ? <p className="text-[13px] text-destructive">{issues.maxWinners}</p> : null}
          </Field>
          <DeadlineField id="prize-deadline" value={deadline} onChange={setDeadline} allowNone />
          {attempted && issues.deadline ? <p className="-mt-2 text-[13px] text-destructive">{issues.deadline}</p> : null}

          <div className="flex flex-col gap-1 border-l-2 border-primary bg-surface px-3 py-2.5">
            <span className="label-caps text-[12px] text-subtle-foreground">Players will see</span>
            <p className="text-[15px]">{preview}</p>
          </div>
        </div>
        <DialogFooter className={footerClass}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setAttempted(true)
              if (!ready) return
              setBusy(true)
              const ok = await run(
                () =>
                  adminRequest("/prizes", {
                    body: {
                      title: title.trim(),
                      description: description.trim() || null,
                      criteria_type: criteria,
                      criteria_trial_name: criteria === "trial_wr" ? trial || null : null,
                      criteria_combo_category_slug: criteria === "combo_wr" ? category || null : null,
                      criteria_target_role_id: criteria === "rankup" ? roleId.trim() || null : null,
                      criteria_score_target: criteria === "score_reached" ? targetValue : null,
                      max_winners: maxWinners === "" ? null : Number(maxWinners),
                      ends_at: deadline === "" ? null : endsAt,
                    },
                  }),
                "Prize is live.",
                "Couldn't create the prize.",
                onCreated
              )
              setBusy(false)
              if (ok) {
                reset()
                onOpenChange(false)
              }
            }}
          >
            {busy ? <Spinner className="size-4" /> : null}
            Create prize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
