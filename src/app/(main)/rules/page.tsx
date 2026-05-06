import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const runRules = [
  "Glitches are not allowed.",
  "Autoparkour and autotransition are not allowed and automatically invalidate a run.",
  "The proof must show the start of the time trial, including the click sound moment, and the endpoint being reached.",
  "The timer, player username, and game version must be visible enough for moderators to verify the run.",
  "After completing a run, you must either show the bottom of your console with Shift + F9 or exit the trial and show the final time",
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
    </div>
  )
}
