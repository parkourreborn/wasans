import Link from "next/link"
import { CalculatorIcon, ClipboardListIcon, InfoIcon, TrophyIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <section className="grid gap-4 py-4">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold">Wasans Score Hub</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            A home for verified time-trial submissions, current world records, and score
            calculation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/submissions/new">New submission</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/rules">Read rules</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link key={action.href} href={action.href}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader className="grid-cols-[auto_1fr] items-center gap-3">
                  <Icon className="size-5" />
                  <CardTitle>{action.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
