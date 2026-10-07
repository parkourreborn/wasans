import { formatScore } from "@/lib/format"
import { TIERS } from "@/lib/tiers"

const LADDER = TIERS.filter((tier) => tier.key !== "unranked")
const FLOOR = LADDER[0].min
const SPAN = 1 - FLOOR

// The tiers as a track from platinum (0.300) to a perfect 1.000, each
// segment starting at its threshold. With a score it marks where that
// player sits, so the next tier is a visible distance away.
export function TierLadder({ score, label = "You" }: { score?: number | null; label?: string }) {
  const hasScore = typeof score === "number" && Number.isFinite(score)
  const pct = hasScore ? Math.min(1, Math.max(0, (score - FLOOR) / SPAN)) * 100 : null
  // Keep the caption inside the track at either end.
  const captionShift = pct == null ? "-50%" : pct < 8 ? "0%" : pct > 92 ? "-100%" : "-50%"

  return (
    <figure className="relative m-0 pb-7" aria-label={hasScore ? `Tier ladder, ${label.toLowerCase()} at ${formatScore(score)}` : "Tier ladder"}>
      <div className="grid grid-cols-7 gap-[3px]">
        {LADDER.map((tier) => (
          <div key={tier.key} className="flex min-w-0 flex-col gap-1.5">
            <span
              className="overflow-hidden font-display text-[13px] font-bold uppercase leading-[18px] tracking-[0.08em] whitespace-nowrap sm:text-[14px]"
              style={{ color: tier.color }}
            >
              <span className="lg:hidden">{tier.short}</span>
              <span className="hidden lg:inline">{tier.name}</span>
            </span>
            <span
              className="h-3"
              style={{
                background: `color-mix(in srgb, ${tier.color} 22%, transparent)`,
                boxShadow: `inset 0 3px 0 ${tier.color}`,
              }}
            />
            <span className="num text-[12px] text-subtle-foreground">{tier.min.toFixed(3)}</span>
          </div>
        ))}
      </div>
      {pct != null ? (
        <>
          <span aria-hidden className="absolute top-[20px] h-[18px] w-0.5 bg-foreground" style={{ left: `${pct}%` }} />
          <figcaption
            className="absolute bottom-0 flex items-center gap-1.5 whitespace-nowrap"
            style={{ left: `${pct}%`, transform: `translateX(${captionShift})` }}
          >
            <span className="label-caps text-[14px]">{label}</span>
            <span className="num text-[13px] font-semibold">{formatScore(score)}</span>
          </figcaption>
        </>
      ) : null}
    </figure>
  )
}
