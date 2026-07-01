import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader, PageShell, SectionCard, StatCard } from "@/components/custom/page-shell"

const scoreSteps = [
  "Each trial gets a score from 0 - 1, where 0 is bronze and 1 is wr.",
  "Your Wasans score is the average of all trial scores.",
  "Because the calculator uses the site's WR table, scores move automatically when approved WRs change.",
]

const roles = [
  ["router", "Above 0.900 Wasans score."],
  ["elite", "Above 0.800 Wasans score."],
  ["master I", "Above 0.700 Wasans score."],
  ["master II", "Above 0.600 Wasans score."],
  ["master III", "Above 0.500 Wasans score."],
  ["diamond", "Above 0.400 Wasans score."],
  ["platinum", "Above 0.300 Wasans score."],
  ["unranked", "Normal members."],
]

const faq = [
  [
    "What does the number in people's usernames mean?",
    "It is their Wasans score, based on their time-trial results compared to current world records.",
  ],
  ["Where is the calculator?", "Use the calculator page on this site."],
  [
    "Who is Wasans?",
    "Wasans is a Korean player from the older Parkour Legacy era. The server name and role names grew out of community lore around that history.",
  ],
  [
    "How do I invite people?",
    "Use the Discord invite shared by staff. The server's rules post includes the active invite https://discord.gg/9pnRYDU6wg.",
  ],
]

function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function InformationPage() {
  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        eyebrow="Reference"
        title="Information"
        description="Score explanation, role thresholds, frequently asked questions, and the short version of the Wasans lore in a single readable reference page."
        aside={<StatCard label="Reference blocks" value="3 sections" meta="Score model, FAQ, and Discord role thresholds." />}
      />

      <SectionCard title="Wasans Score" description="Understand what the number means and where it comes from.">
        <div className="grid gap-3">
          <p>
            Wasans Score is a skill value for time trials. Higher is better, and a score of
            1.000 means holding every current world record.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {scoreSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/calculator" className="underline underline-offset-4">
              Calculator
            </Link>
            <Link href="/wrs" className="underline underline-offset-4">
              Current WRs
            </Link>
            <Link href="/rules" className="underline underline-offset-4">
              Submission rules
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="FAQ" description="The short answers players ask for most often.">
        <div className="grid gap-4">
          {faq.map(([question, answer]) => (
            <div key={question}>
              <h2 className="font-semibold">{question}</h2>
              <p className="text-muted-foreground">{answer}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Score roles (Discord)" description="Role thresholds used by the community Discord.">
        <div className="grid gap-2 md:grid-cols-2">
          {roles.map(([role, description]) => (
            <div key={role} className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="font-semibold">@{role}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  )
}
