"use client"

import { useState } from "react"
import calculateScore from "@/lib/calc-score"
import { formatScore } from "@/lib/format"
import { composeDenyNote, DENY_REASONS, MODERATOR_NOTE_MAX, type RunKind } from "@/lib/moderation"
import { parseRunTime, TIME_DRAFT_PATTERN } from "@/lib/submission-input"
import type { TrialName } from "@/lib/trials"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

const contentClass = "gap-5 p-6 sm:max-w-lg"
const titleClass = "label-caps text-2xl tracking-[0.04em]"

function isModEnter(event: React.KeyboardEvent) {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey)
}

// Picks one or more reasons from the rules (number keys toggle them) plus
// optional words of the moderator's own. The player sees the combined note.
export function DenyDialog({
  open,
  onOpenChange,
  kind,
  runLabel,
  initialNote,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: RunKind
  runLabel: string
  initialNote?: string | null
  busy?: boolean
  onConfirm: (note: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClass}>
        <DenyForm kind={kind} runLabel={runLabel} initialNote={initialNote} busy={busy} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  )
}

function DenyForm({
  kind,
  runLabel,
  initialNote,
  busy,
  onConfirm,
}: {
  kind: RunKind
  runLabel: string
  initialNote?: string | null
  busy: boolean
  onConfirm: (note: string) => void
}) {
  const reasons = DENY_REASONS[kind]
  const [picked, setPicked] = useState<number[]>([])
  const [extra, setExtra] = useState(initialNote ?? "")
  const note = composeDenyNote(
    picked.map((index) => reasons[index]),
    extra
  )
  const tooLong = note.length > MODERATOR_NOTE_MAX
  const canConfirm = note.length > 0 && !tooLong && !busy

  const toggle = (index: number) => {
    setPicked((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((a, b) => a - b)
    )
  }

  const submit = () => {
    if (canConfirm) onConfirm(note)
  }

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (isModEnter(event)) {
          event.preventDefault()
          submit()
          return
        }
        if (event.target instanceof HTMLTextAreaElement || event.metaKey || event.ctrlKey || event.altKey) return
        const digit = event.key === "0" ? 10 : Number(event.key)
        if (Number.isInteger(digit) && digit >= 1 && digit <= reasons.length) {
          event.preventDefault()
          toggle(digit - 1)
        }
      }}
    >
      <DialogHeader className="gap-1.5">
        <DialogTitle className={titleClass}>Deny run</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
          {runLabel}. Pick what broke the rules; the player gets this as the reason.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="label-caps mb-2 text-[13px] text-subtle-foreground">Reasons</legend>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((reason, index) => {
            const on = picked.includes(index)
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(index)}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors",
                  on
                    ? "border-destructive/50 bg-destructive/15 text-foreground"
                    : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
                )}
              >
                {index < 10 ? (
                  <span className="num text-[11px] text-subtle-foreground" aria-hidden>
                    {index === 9 ? 0 : index + 1}
                  </span>
                ) : null}
                {reason}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="deny-extra" className="label-caps text-[13px] text-subtle-foreground">
          In your own words <span className="font-sans text-xs normal-case tracking-normal">(optional)</span>
        </Label>
        <Textarea
          id="deny-extra"
          value={extra}
          onChange={(event) => setExtra(event.target.value)}
          placeholder="Anything the player should know, e.g. the timestamp"
          maxLength={MODERATOR_NOTE_MAX}
          className="min-h-20"
          disabled={busy}
        />
      </div>

      <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label-caps text-[13px] text-subtle-foreground">The player will see</span>
          <span className={cn("num text-xs", tooLong ? "text-destructive" : "text-subtle-foreground")}>
            {note.length}/{MODERATOR_NOTE_MAX}
          </span>
        </div>
        <p className={cn("text-sm leading-relaxed", note ? "text-foreground" : "text-subtle-foreground")}>
          {note || "Pick a reason or write one."}
        </p>
      </div>

      <DialogFooter className="-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4">
        <Button type="submit" disabled={!canConfirm} className="bg-destructive text-background hover:bg-destructive/85 sm:min-w-28">
          {busy ? <Spinner className="size-4" /> : null}
          Deny
        </Button>
      </DialogFooter>
    </form>
  )
}

export function NoteDialog({
  open,
  onOpenChange,
  runLabel,
  initialNote,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  runLabel: string
  initialNote?: string | null
  busy?: boolean
  onConfirm: (note: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClass}>
        <NoteForm runLabel={runLabel} initialNote={initialNote} busy={busy} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  )
}

function NoteForm({
  runLabel,
  initialNote,
  busy,
  onConfirm,
}: {
  runLabel: string
  initialNote?: string | null
  busy: boolean
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState(initialNote ?? "")
  const trimmed = note.trim()
  const canSave = trimmed.length > 0 && trimmed !== (initialNote ?? "").trim() && !busy

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) onConfirm(trimmed)
      }}
      onKeyDown={(event) => {
        if (isModEnter(event) && canSave) {
          event.preventDefault()
          onConfirm(trimmed)
        }
      }}
    >
      <DialogHeader className="gap-1.5">
        <DialogTitle className={titleClass}>Moderator note</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
          {runLabel}. The player can read this note on the run.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="moderator-note" className="sr-only">
          Note
        </Label>
        <Textarea
          id="moderator-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MODERATOR_NOTE_MAX}
          className="min-h-28"
          disabled={busy}
          autoFocus
        />
        <span className="num text-right text-xs text-subtle-foreground">
          {trimmed.length}/{MODERATOR_NOTE_MAX}
        </span>
      </div>
      <DialogFooter className="-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4">
        <Button type="submit" disabled={!canSave} className="sm:min-w-28">
          {busy ? <Spinner className="size-4" /> : null}
          Save note
        </Button>
      </DialogFooter>
    </form>
  )
}

export function EditTimeDialog({
  open,
  onOpenChange,
  runLabel,
  currentTime,
  trialName,
  wrTime,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  runLabel: string
  currentTime: number
  trialName: string
  wrTime?: number | null
  busy?: boolean
  onConfirm: (time: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClass}>
        <EditTimeForm
          runLabel={runLabel}
          currentTime={currentTime}
          trialName={trialName}
          wrTime={wrTime}
          busy={busy}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}

function EditTimeForm({
  runLabel,
  currentTime,
  trialName,
  wrTime,
  busy,
  onConfirm,
}: {
  runLabel: string
  currentTime: number
  trialName: string
  wrTime?: number | null
  busy: boolean
  onConfirm: (time: string) => void
}) {
  const [value, setValue] = useState(currentTime.toFixed(3))
  const parsed = parseRunTime(value)
  const changed = parsed !== null && parsed !== currentTime
  const scoreOf = (time: number) => (wrTime ? formatScore(calculateScore(wrTime, time, trialName as TrialName)) : null)
  const before = scoreOf(currentTime)
  const after = parsed !== null ? scoreOf(parsed) : null

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        if (changed && !busy) onConfirm(value.trim())
      }}
    >
      <DialogHeader className="gap-1.5">
        <DialogTitle className={titleClass}>Edit time</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
          {runLabel}. Use this when the time entered doesn&apos;t match the video.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="edit-time" className="label-caps text-[13px] text-subtle-foreground">
          Time
        </Label>
        <Input
          id="edit-time"
          value={value}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            if (TIME_DRAFT_PATTERN.test(event.target.value)) setValue(event.target.value)
          }}
          aria-invalid={value.trim() !== "" && parsed === null}
          className="num h-11 max-w-48 text-lg"
          disabled={busy}
        />
        {value.trim() !== "" && parsed === null ? (
          <p className="text-sm text-destructive">Enter a positive time with up to three decimals.</p>
        ) : before && after && changed ? (
          <p className="text-sm text-muted-foreground">
            Trial score <span className="num text-foreground">{before}</span> to{" "}
            <span className="num text-foreground">{after}</span>
          </p>
        ) : null}
      </div>
      <DialogFooter className="-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4">
        <Button type="submit" disabled={!changed || busy} className="sm:min-w-28">
          {busy ? <Spinner className="size-4" /> : null}
          Save time
        </Button>
      </DialogFooter>
    </form>
  )
}

// Asks before something that can't be taken back.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  tone = "destructive",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  busy?: boolean
  // "default" for confirmations that aren't destructive (running a repair).
  tone?: "destructive" | "default"
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClass}>
        <DialogHeader className="gap-1.5">
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-xl border-line bg-surface px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant={tone} onClick={onConfirm} disabled={busy} className="sm:min-w-28">
            {busy ? <Spinner className="size-4" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
