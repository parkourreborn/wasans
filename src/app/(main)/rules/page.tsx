import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const serverRules = [
  {
    title: "Keep content appropriate",
    items: [
      "Do not post NSFW, gore, self-harm content, or other material staff considers unsafe for the server.",
      "This applies to messages, media, usernames, avatars, profiles, and anything else visible through the community.",
    ],
  },
  {
    title: "No hate speech or slurs",
    items: [
      "Do not target people or groups with hateful language.",
      "The N-word is not allowed at all.",
    ],
  },
  {
    title: "No unwanted promotion",
    items: [
      "Do not advertise without explicit staff approval.",
      "Unwanted DM advertising can result in an immediate ban, including cases where your account was compromised.",
    ],
  },
  {
    title: "Respect other members",
    items: [
      "Do not harass, threaten, or repeatedly antagonize people.",
      "If staff asks you to stop something that is harming the atmosphere, stop.",
    ],
  },
  {
    title: "No doxxing",
    items: ["Posting someone else's personal information without consent is an immediate ban."],
  },
  {
    title: "Use English in public channels",
    items: ["A few words in another language are fine, but public conversations should stay readable to staff."],
  },
  {
    title: "Staff decisions are final",
    items: [
      "These rules cannot cover every situation. Staff may act on behavior that damages the server even if it is not listed word for word.",
      "If you believe a moderator abused power, contact a higher-role staff member.",
    ],
  },
]

const runRules = [
  "Glitches are not allowed.",
  "Autoparkour and autotransition are not allowed and automatically invalidate a run.",
  "The proof must show the start of the time trial, including the click sound moment, and the endpoint being reached.",
  "The timer, player username, and game version must be visible enough for moderators to verify the run.",
  "PC players must show FPS with Shift + F5 for the full run. Console players are exempt because they cannot unlock FPS.",
  "If you are permanently banned from the game, you are not eligible to submit member runs. This follows the main game rules.",
  "Alternative accounts are allowed unless you are banned from the game, because that counts as ban evasion.",
  "World-record runs should be submitted within a reasonable time after they are recorded. Normal life delays are fine; gatekeeping or hiding a run for a long time is not.",
]

const submissionRules = [
  "Enter the run time with no more than three decimal places.",
  "Upload a video file or provide an approved proof link. YouTube and Medal links are accepted.",
  "Cut clips tightly enough that the start, run, and finish are convincing, while still including all required verification details.",
  "You may submit multiple runs at once from the New Submission page.",
  "The site rejects times slower than your current personal best so your score record stays clean.",
  "A submission starts as pending. Moderators can move it between pending, approved, and denied at any time.",
]

const applicationRules = [
  "To become an official member, your Wasans score must meet the minimum requirement. The current requirement is 0.300.",
  "Use the calculator page to estimate your score with the current WRs from the site's WR table.",
  "Prepare proof for every run used in the application.",
  "Submit each score through the site so moderators can approve the runs directly.",
  "After your relevant runs are approved, staff can use the resulting score to decide the role or member application.",
]

function RuleSection({
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

export default function RulesPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Rules</h1>
        <p className="text-muted-foreground">
          One place for server conduct, run validity, submissions, and score applications.
        </p>
      </div>

      <RuleSection title="Score And Run Rules">
        <ul className="list-disc space-y-2 pl-5">
          {runRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </RuleSection>

      <RuleSection title="Submission Rules">
        <ul className="list-disc space-y-2 pl-5">
          {submissionRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </RuleSection>

      <RuleSection title="Member Applications">
        <ul className="list-disc space-y-2 pl-5">
          {applicationRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </RuleSection>

      <RuleSection title="Server Conduct">
        <div className="grid gap-4 md:grid-cols-2">
          {serverRules.map((section) => (
            <div key={section.title} className="grid gap-2">
              <h2 className="font-semibold">{section.title}</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </RuleSection>
    </div>
  )
}
