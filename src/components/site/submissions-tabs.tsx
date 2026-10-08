"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

// Trials | Combos switch at the top of the submissions lists. A player
// filter (?player_uuid=, e.g. from "Your submissions") carries across.
export function SubmissionsTabs({ active }: { active: "trials" | "combos" }) {
  const searchParams = useSearchParams()
  const player = searchParams.get("player_uuid")
  const query = player ? `?player_uuid=${encodeURIComponent(player)}` : ""
  const tabs = [
    { key: "trials", label: "Trial runs", href: `/submissions/trials${query}` },
    { key: "combos", label: "Combos", href: `/submissions/combos${query}` },
  ] as const

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1 pt-2">
      <h1 className="font-display text-[44px] font-extrabold uppercase leading-[0.9] md:text-[56px]">Submissions</h1>
      <nav aria-label="Submission type" className="flex gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "label-caps flex h-10 items-center rounded-md border px-4 text-[15px] transition-colors",
              tab.key === active
                ? "border-foreground bg-foreground text-background"
                : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
