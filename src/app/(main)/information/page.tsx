import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const scoreSteps = [
  "Each trial gets a score using (WR / your time)^3.",
  "A score of 1.000 on one trial means you match the current WR for that trial.",
  "Your Wasans score is the average of all trial scores.",
  "Because the calculator uses the site's WR table, scores move automatically when approved WRs change.",
]

const roles = [
  ["wasans", "Lore role."],
  ["chr and headrog", "Administrator."],
  ["slave", "Emergency administrator when admins and staff are offline."],
  ["security", "Staff members."],
  ["score moderator", "Moderates score submissions."],
  ["macro", "Bot role."],
  ["router", "Above 0.900 Wasans score."],
  ["elite", "Above 0.750 Wasans score."],
  ["master I", "Above 0.600 Wasans score."],
  ["master II", "Above 0.450 Wasans score."],
  ["master III", "Above 0.300 Wasans score."],
  ["wasans member", "Granted by reaching at least 0.300 Wasans score."],
  ["contributor", "Special thanks for major project help."],
  ["route envisioner", "Content creator role, usually for creators with 500+ subscribers."],
  ["booster", "Server booster perks."],
  ["anzuce", "Permission to talk in anzucement, originally level 20."],
  ["image perm", "Permission to send images and embeds in yapperal, originally level 10."],
  ["unranked", "Normal members."],
]

const pings = [
  ["announcement ping", "Receives half-important announcement pings."],
  ["wr ping", "Receives world-record update notifications."],
  ["content ping", "Receives route-envisioner upload notifications."],
  ["giveaway ping", "Receives giveaway notifications."],
  ["poll ping", "Receives poll notifications."],
  ["minecraft smh ping", "Receives Minecraft SMP updates."],
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
    "Use the Discord invite shared by staff. The exported server post included the active invite https://discord.gg/9pnRYDU6wg.",
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Information</h1>
        <p className="text-muted-foreground">
          Score explanation, role thresholds, FAQ, and the short version of the Wasans lore.
        </p>
      </div>

      <InfoCard title="Wasans Score">
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
      </InfoCard>

      <InfoCard title="FAQ">
        <div className="grid gap-4">
          {faq.map(([question, answer]) => (
            <div key={question}>
              <h2 className="font-semibold">{question}</h2>
              <p className="text-muted-foreground">{answer}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      <InfoCard title="Discord Roles">
        <div className="grid gap-2 md:grid-cols-2">
          {roles.map(([role, description]) => (
            <div key={role} className="rounded-md border border-border p-3">
              <p className="font-semibold">@{role}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      <InfoCard title="Optional Ping Roles">
        <div className="grid gap-2 md:grid-cols-2">
          {pings.map(([role, description]) => (
            <div key={role} className="rounded-md border border-border p-3">
              <p className="font-semibold">@{role}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      

    </div>
  )
}
