import Link from "next/link"
import { ArrowRightIcon, CalculatorIcon, ClipboardListIcon, InfoIcon, TrophyIcon, MedalIcon, BookIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/custom/page-shell"

const quickLinks = [
  {
    "href": "/rules",
    "title": "Rules",
    "description": "Read the official rules for valid runs, submissions, and applications.",
    "icon": BookIcon,
  },
  {
    href: "/information",
    title: "Information",
    description: "See FAQ and site/discord details.",
    icon: InfoIcon,
  },
  {
    href: "/submissions",
    title: "Submit Runs",
    description: "Submit your own runs for review.",
    icon: ClipboardListIcon,
  },
  {
    href: "/wrs",
    title: "World Records",
    description: "See world records for every trial.",
    icon: MedalIcon,
  },
  {
    href: "/calculator",
    title: "Calculator",
    description: "Estimate scores with live data.",
    icon: CalculatorIcon,
  },
  {
    href: "/players",
    title: "Leaderboard",
    description: "Browse rankings and player history.",
    icon: TrophyIcon,
  }
]

export default function HomePage() {
  return (
    <PageShell>
      <section className="animate-subtle-in relative overflow-hidden rounded-3xl border border-border/70 bg-background/55 px-5 py-8 shadow-[0_30px_90px_-55px_rgba(0,0,0,0.85)] md:px-8 md:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--page-accent) 16%, transparent), transparent)" }}
        />

        <div className="relative z-10 grid gap-7 lg:grid-cols-[1.2fr,0.8fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Parkour Reborn</p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              The home for official scores, records, and submissions.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              All competitive data in one place.
            </p>
          </div>
        </div>
      </section>

      <section className="animate-subtle-in">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Get Started</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((linkItem) => {
            const Icon = linkItem.icon
            return (
              <Link key={linkItem.href} href={linkItem.href}>
                <Card className="h-full rounded-2xl border-border/70 bg-background/55 transition hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-[0_18px_44px_-30px_rgba(0,0,0,0.9)]">
                  <CardContent className="flex h-full items-start gap-3 p-4">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/45">
                      <Icon className="size-4.5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-semibold tracking-tight text-foreground">{linkItem.title}</p>
                      <p className="text-sm text-muted-foreground">{linkItem.description}</p>
                      <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-primary">
                        Open <ArrowRightIcon className="size-3.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
    </PageShell>
  )
}
