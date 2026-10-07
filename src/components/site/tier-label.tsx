import { cn } from "@/lib/utils"
import type { Tier } from "@/lib/tiers"

// A tier's name in its color, e.g. "MASTER III". Text, not a badge: in a
// table column the color does the work and a filled pill on every row would
// be noise.
export function TierLabel({ tier, short = false, className }: { tier: Tier; short?: boolean; className?: string }) {
  return (
    <span
      className={cn("font-display text-[15px] font-bold uppercase tracking-[0.08em] whitespace-nowrap", className)}
      style={{ color: tier.color }}
    >
      {short ? tier.short : tier.name}
    </span>
  )
}
