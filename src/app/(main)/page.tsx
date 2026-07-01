import Link from "next/link"
import { ArrowRightIcon, CalculatorIcon, ClipboardListIcon, InfoIcon, TrophyIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader, PageShell, SectionCard } from "@/components/custom/page-shell"

const actions = [
  {
    href: "/submissions",
    title: "Submit Runs",
    description: "Upload proof, track pending reviews, and let moderators approve score updates.",
    icon: ClipboardListIcon,
  },
  {
    href: "/wrs",
    title: "World Records",
    description: "See the current approved WR for every trial.",
    icon: TrophyIcon,
  },
  {
    href: "/calculator",
    title: "Calculator",
    description: "Calculate scores using the live WR table.",
    icon: CalculatorIcon,
  },
  {
    href: "/information",
    title: "Information",
    description: "Learn scoring, roles, FAQ, and community background.",
    icon: InfoIcon,
  },
]

export default function HomePage() {
  return (
    <PageShell>
      <PageHeader
        title="Wasans Score Hub"
        actions={
          <>
            <Button asChild>
              <Link href="/submissions/new">New submission</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/players">Open players</Link>
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href}>
                <Card className="glass-panel h-full rounded-[24px] border-border/70 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_28px_60px_-36px_rgba(0,0,0,0.9)]">
                  <CardHeader className="space-y-4">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-xl">{action.title}</CardTitle>
                      <p className="text-sm leading-6 text-muted-foreground">{action.description}</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      Open <ArrowRightIcon className="size-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </SectionCard>
    </PageShell>
  )
}
