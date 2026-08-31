"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  calculateFinalTime,
  formatThousandths,
  roundToThousandths,
  type RoundingMode,
} from "@/lib/hudzell-time"

// Permissive while typing: the field has to accept more than three decimals,
// since rounding those extra digits away is the whole point of the tool. The
// finish time is a stopwatch reading, so it takes no sign; hudzell pain is a
// correction that can go either way.
const FINISH_DRAFT = /^\d*(\.\d{0,9})?$/
const PAIN_DRAFT = /^-?\d*(\.\d{0,9})?$/

function TimeField({
  id,
  label,
  hint,
  value,
  draftPattern,
  mode,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  draftPattern: RegExp
  mode: RoundingMode
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.000"
        aria-describedby={`${id}-hint`}
        className="w-24 font-mono tabular-nums sm:w-28"
        onChange={(event) => {
          if (draftPattern.test(event.target.value)) {
            onChange(event.target.value)
          }
        }}
        // Rounding is applied to the value the moment focus leaves, so the
        // field shows exactly the number the result was built from.
        onBlur={() => {
          const rounded = roundToThousandths(value, mode)
          if (rounded !== null) {
            onChange(formatThousandths(rounded))
          }
        }}
      />
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  )
}

function Operator({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="pb-1.5 text-base font-medium text-muted-foreground">
      {children}
    </span>
  )
}

// Recreates the in-game correction from the rules FAQ: when a run does not
// beat its personal best the final time never appears on screen, so players
// read the timer and the "hudzell's great pain reduced your time by" console
// line and work out the real time themselves. Rounding is deliberately
// asymmetric — the finish time down, the pain up — so the arithmetic can
// never round a run into looking faster than it was.
export function HudzellCalculator({ className }: { className?: string }) {
  const [finishTime, setFinishTime] = React.useState("")
  const [hudzellPain, setHudzellPain] = React.useState("")

  const { finish, final } = calculateFinalTime(finishTime, hudzellPain)
  const finishIsInvalid = finishTime.trim() !== "" && finish === null

  return (
    <section
      aria-labelledby="hudzell-calculator-title"
      className={cn("rounded-lg border border-border bg-card/60 p-3", className)}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id="hudzell-calculator-title" className="text-sm font-semibold">
          Hudzell calculator
        </h2>
        <p className="text-xs text-muted-foreground">
          Finish time rounds down, pain rounds up
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <TimeField
          id="hudzell-finish-time"
          label="Finish Time"
          hint="The time on the trial timer. Rounded down to three decimals."
          value={finishTime}
          draftPattern={FINISH_DRAFT}
          mode="down"
          onChange={setFinishTime}
        />

        <Operator>&minus;</Operator>

        <TimeField
          id="hudzell-pain"
          label="Hudzell Pain"
          hint="The value from the hudzell's great pain console line. Rounded up to three decimals."
          value={hudzellPain}
          draftPattern={PAIN_DRAFT}
          mode="up"
          onChange={setHudzellPain}
        />

        <Operator>=</Operator>

        <div className="grid gap-1.5">
          <Label htmlFor="hudzell-final-time" className="text-xs font-medium text-muted-foreground">
            Final Time
          </Label>
          <Input
            id="hudzell-final-time"
            readOnly
            tabIndex={-1}
            value={final === null ? "" : formatThousandths(final)}
            placeholder="—"
            aria-live="polite"
            // Reads as a result, not a field: filled, borderless, and heavier
            // than the two inputs feeding it.
            className="w-24 cursor-default border-transparent bg-muted text-base font-semibold font-mono tabular-nums focus-visible:ring-0 sm:w-28"
          />
        </div>
      </div>

      {finishIsInvalid ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Enter the finish time as a number, e.g. 7.1234
        </p>
      ) : null}
    </section>
  )
}
