"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

type TrialOption = { value: string; label: string; hint?: string }

// A trial picker you can type into: "gl" narrows the list to Glass. Clearing
// the text never clears the choice, and leaving the field puts the chosen
// trial's name back.
export function TrialCombobox({
  trials,
  value,
  onValueChange,
  anyLabel,
  hints,
  id,
  placeholder = "Choose a trial",
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  trials: readonly string[]
  value: string
  onValueChange: (value: string) => void
  /** Adds a first option meaning "no particular trial", chosen when value is "". */
  anyLabel?: string
  /** Small right-aligned text per trial, e.g. the player's PB. */
  hints?: ReadonlyMap<string, string>
  id?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  const options = useMemo<TrialOption[]>(() => {
    const list = trials.map((trial) => ({ value: trial, label: trial, hint: hints?.get(trial) }))
    return anyLabel ? [{ value: "", label: anyLabel }, ...list] : list
  }, [anyLabel, hints, trials])

  const selected = options.find((option) => option.value === value) ?? null

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option) => {
        if (option) onValueChange(option.value)
      }}
      isItemEqualToValue={(item, current) => item.value === current.value}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={cn("h-10 w-full", className)}
        // Selecting the current name means typing replaces it rather than
        // appending to it ("Glassgl" matches nothing).
        onFocus={(event) => event.currentTarget.select()}
      />
      <ComboboxContent>
        <ComboboxEmpty>No trial matches that.</ComboboxEmpty>
        <ComboboxList>
          {(option: TrialOption) => (
            <ComboboxItem key={option.value || "__any"} value={option}>
              <span className="flex w-full items-baseline justify-between gap-6">
                {option.label}
                {option.hint ? <span className="num text-xs text-muted-foreground">{option.hint}</span> : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
