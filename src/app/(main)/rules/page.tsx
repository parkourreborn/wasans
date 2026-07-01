import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader, PageShell, SectionCard, StatCard } from "@/components/custom/page-shell"

const runRules = [
  "Any glitches are prohibited. Banned glitches include: teleportation glitches, double vaulting, coil slide on a slope, impossible moves, and velocity-overriding moves (drophop).",
  "Using autoparkour and autotransition is prohibited and automatically invalidates the run.",
  "The clip must include the entire run, along with the actual time after exiting the trial.",
  "The clip must clearly show: the timer, player's username, and the game build number at the bottom of the screen.",
  "If you are permanently banned from the game, you are ineligible to submit runs. This is done to comply with the main game rule.",
  "Alternative accounts are allowed ONLY if you are not ban evading.",
  "World-record runs must be submitted within an acceptable time after being recorded. Normal life delays (vacation, sleep) are acceptable. Gatekeeping or intentionally delaying submission is not acceptable.",
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

const faqItems = [
  {
    question: "What is considered as a 'glitch'?",
    answer: "Currently banned glitches include: any form of teleportation glitches, double vaulting (only doable via autoparkour; banned regardless), coil slide on a slope (extremely buggy and causes random speed boosts), moves not deemed to be technically possible (such as 'wasans boost'), and afterboost overriding current velocity (drophop).",
  },
  {
    question: "My video quality is low. Is this fine?",
    answer: "If the necessary details are not visible properly, your run may be rejected under the score moderator's decision. You take responsibility for your video bitrate settings.",
  },
  {
    question: "What do I do if I couldn't beat my previous personal best?",
    answer: "If your personal best wasn't beaten, you won't see the final time on screen. Open the developer console (F9) and search for 'hudzell's great pain reduced your time by (time)'. Subtract this value from your timer time to get your actual time. Both the timer time and hudzell pain must be clearly visible in your clip for the score moderator to confirm.",
  },
  {
    question: "There's too much rules to read. What are the essentials?",
    answer: "Show your final time after finish and have proper video quality.",
  },
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
    <PageShell className="max-w-6xl">
      <PageHeader
        eyebrow="Policy"
        title="Rules"
        description="One clean reference for run validity, submission expectations, and member application requirements."
        aside={<StatCard label="Sections" value="4 blocks" meta="Run rules, submissions, applications, and FAQ." />}
      />

      <SectionCard title="Score and run rules" description="What makes a run valid and what automatically invalidates it.">
        <ul className="list-disc space-y-2 pl-5">
          {runRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Submission rules" description="Requirements for proof, time entry, and moderation flow.">
        <ul className="list-disc space-y-2 pl-5">
          {submissionRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Member applications" description="What a player needs before staff can review a score-based application.">
        <ul className="list-disc space-y-2 pl-5">
          {applicationRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Frequently asked questions" description="The practical edge cases players most often need clarified.">
        <div className="space-y-4">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="font-semibold mb-1">{item.question}</h3>
              <p className="text-sm text-muted-foreground">{item.answer}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </PageShell>
  )
}
