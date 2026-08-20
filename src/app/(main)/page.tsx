import Link from "next/link"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ArrowRightIcon, CalculatorIcon, ClipboardListIcon, InfoIcon, TrophyIcon, MedalIcon, BookIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader, PageShell } from "@/components/custom/page-shell"

type ActivityCountRow = {
  count?: number
}

type ActivityLatestRow = {
  trial_name?: string
  player_name?: string
  time?: number
}

const quickLinks = [
  {
    href: "/rules",
    title: "Rules",
    description: "Read the official rules for valid runs, submissions, and applications.",
    icon: BookIcon,
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
  },
]

export default async function HomePage() {
  let activity = {
    submissionCount: 0,
    playerCount: 0,
    latestWr: null as null | { trial_name: string; player_name: string; time: number },
    latestSubmission: null as null | { trial_name: string; player_name: string; time: number },
  }

  try {
    const { env } = await getCloudflareContext({ async: true })
    if (env?.wasans) {
      const statements = [
        env.wasans.prepare("SELECT COUNT(*) AS count FROM submissions"),
        env.wasans.prepare("SELECT COUNT(*) AS count FROM players"),
        env.wasans.prepare(
          `SELECT trial_name, player_name, time
           FROM wrs
           ORDER BY date DESC, trial_name ASC
           LIMIT 1`
        ),
        env.wasans.prepare(
          `SELECT trial_name, player_name, time
           FROM submissions
           ORDER BY date DESC, uuid DESC
           LIMIT 1`
        ),
      ]

      const [submissionCountResult, playerCountResult, latestWrResult, latestSubmissionResult] = await env.wasans.batch(statements)
      const submissionCountRow = submissionCountResult.results?.[0] as ActivityCountRow | undefined
      const playerCountRow = playerCountResult.results?.[0] as ActivityCountRow | undefined
      const latestWrRow = latestWrResult.results?.[0] as ActivityLatestRow | undefined
      const latestSubmissionRow = latestSubmissionResult.results?.[0] as ActivityLatestRow | undefined

      activity = {
        submissionCount: Number(submissionCountRow?.count ?? 0),
        playerCount: Number(playerCountRow?.count ?? 0),
        latestWr: latestWrRow ? {
          trial_name: String(latestWrRow.trial_name ?? ""),
          player_name: String(latestWrRow.player_name ?? ""),
          time: Number(latestWrRow.time ?? 0),
        } : null,
        latestSubmission: latestSubmissionRow ? {
          trial_name: String(latestSubmissionRow.trial_name ?? ""),
          player_name: String(latestSubmissionRow.player_name ?? ""),
          time: Number(latestSubmissionRow.time ?? 0),
        } : null,
      }
    }
  } catch {
    // Keep the zeroed defaults if D1 is unavailable.
  }

  return (
    <PageShell>
      <PageHeader
        title="Wasans"
        description="Official scores, world records, and run submissions for Parkour Reborn time trials."
      />

      <section className="flex flex-wrap items-center gap-2 text-sm">
        <div className="rounded-full border border-border px-3 py-1.5">
          <span className="text-muted-foreground">Submissions:</span>{" "}
          <span className="font-medium text-foreground">{activity.submissionCount.toLocaleString()}</span>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5">
          <span className="text-muted-foreground">Players:</span>{" "}
          <span className="font-medium text-foreground">{activity.playerCount.toLocaleString()}</span>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5">
          <span className="text-muted-foreground">Latest WR:</span>{" "}
          <span className="font-medium text-foreground">
            {activity.latestWr ? `${activity.latestWr.trial_name} · ${activity.latestWr.time.toFixed(3)} by ${activity.latestWr.player_name}` : "None yet"}
          </span>
        </div>
        <div className="rounded-full border border-border px-3 py-1.5">
          <span className="text-muted-foreground">Latest submission:</span>{" "}
          <span className="font-medium text-foreground">
            {activity.latestSubmission ? `${activity.latestSubmission.trial_name} · ${activity.latestSubmission.time.toFixed(3)} by ${activity.latestSubmission.player_name}` : "None yet"}
          </span>
        </div>
      </section>

      <section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((linkItem) => {
            const Icon = linkItem.icon
            return (
              <Link key={linkItem.href} href={linkItem.href}>
                <Card className="h-full transition-colors hover:border-foreground/30">
                  <CardContent className="flex h-full items-start gap-3 p-4">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
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
