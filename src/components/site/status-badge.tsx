import { CheckIcon, ClockIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type RunState = "approved" | "pending" | "denied"

export function normalizeRunState(state: string | null | undefined): RunState {
  return state === "approved" || state === "denied" ? state : "pending"
}

const styles: Record<RunState, { label: string; className: string; Icon: typeof CheckIcon }> = {
  approved: { label: "Approved", className: "border-success/35 bg-success/10 text-success", Icon: CheckIcon },
  pending: { label: "Pending", className: "border-line-strong text-muted-foreground", Icon: ClockIcon },
  denied: { label: "Denied", className: "border-destructive/40 bg-destructive/10 text-destructive", Icon: XIcon },
}

export function StatusBadge({ state, className }: { state: RunState; className?: string }) {
  const { label, className: tone, Icon } = styles[state]
  return (
    <span className={cn("label-caps inline-flex h-6 items-center gap-1 border px-2 text-[13px]", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}

// Gold is for records only.
export function WrBadge({ className }: { className?: string }) {
  return (
    <span className={cn("label-caps inline-flex h-6 items-center bg-gold px-2 text-[13px] text-background", className)}>
      WR
    </span>
  )
}
