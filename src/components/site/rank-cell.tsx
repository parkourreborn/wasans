import { cn } from "@/lib/utils"

const medalColors: Record<number, string> = {
  1: "var(--gold)",
  2: "var(--silver)",
  3: "var(--bronze)",
}

// A leaderboard position. The top three get a filled medal chip; gold,
// silver and bronze are reserved for this and for records.
export function RankCell({ rank, className }: { rank: number | null | undefined; className?: string }) {
  if (!rank) {
    return <span className={cn("num w-7 text-center text-sm text-subtle-foreground", className)}>—</span>
  }

  const medal = medalColors[rank]
  if (medal) {
    return (
      <span
        className={cn("num flex h-6 w-7 items-center justify-center text-[13px] font-semibold text-background", className)}
        style={{ background: medal }}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
    )
  }

  return <span className={cn("num w-7 text-center text-sm text-muted-foreground", className)}>{rank}</span>
}
