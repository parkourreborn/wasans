import type { Metadata } from "next"
import Link from "next/link"
import { PageShell, SectionCard } from "@/components/custom/page-shell"
import { legalContactEmail, legalUpdatedLabel } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Terms of Service | wasans",
  description: "Terms for using the Wasans website.",
}

const usageRules = [
  "Use the site for what it is for: tracking scores, browsing the leaderboard, and submitting and reviewing runs.",
  "Do not submit fake runs, someone else's proof, malicious files, spam, or anything that breaks the game or community rules.",
  "Do not try to break, scrape, overload, or work around the site, its API, Discord login, the moderation tools, or the video storage. There are rate limits — do not go looking for ways around them.",
  "Do not impersonate another player or use someone else's Discord account.",
]

const publicDataRules = [
  "Your profile, scores, submissions, personal bests, world records, the moderator notes on your runs, and your proof videos are all public, through the API as well as the site.",
  "Your proof video is reachable by its link as soon as it is uploaded — including while it is pending, and including if it is denied.",
  "Submitting a run posts it to our Discord automatically, with your name, your Discord ID, the trial, and the time.",
  "By submitting a run you confirm the proof is yours to share, and you let us host, display, review, and moderate it.",
  "Your public score history can stay visible after you delete your account, shown as Deleted Account.",
]

export default function TermsPage() {
  return (
    <PageShell className="max-w-4xl">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated {legalUpdatedLabel}.</p>
      </div>

      <SectionCard title="Who runs this">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            This site is run by the website operators and project maintainers of the Wasans score and submission community. It is a community project, not a company.
          </p>
          <p>
            If you need to reach us about these Terms, email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Using the site">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {usageRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Logging in with Discord">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Some things need an account, and the only way to get one is Discord. Logging in means you accept these Terms and the{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-4">Privacy Policy</Link>.
          </p>
          <p>
            We ask Discord for the smallest permission it offers — enough to see your username, ID, and avatar, and nothing else. We do not keep the tokens Discord hands us; we read who you are and discard them.
          </p>
          <p>
            The Discord account you use is your responsibility. If it gets compromised, secure it with Discord first, then tell us if anything happened to your account here.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="What is public">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {publicDataRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Moderation">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Moderators can approve or deny a run, correct an obviously wrong time, and leave a note on it. Those notes are public, and every one of those actions is recorded in the audit log against the moderator who made it.
          </p>
          <p>
            If a run is approved or denied, we will usually DM you on Discord to say so.
          </p>
          <p>
            Owners can also block an account from submitting new runs, with a reason you will see on the submission page. Existing runs stay where they are. This is for people who keep submitting fake or stolen proof.
          </p>
          <p>
            Beyond that, we can deactivate or delete an account that breaks these Terms, abuses the site, or makes life worse for everyone else.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Leaderboard changes">
        <p className="text-sm leading-6 text-muted-foreground">
          Trials get added, versioned, and retired, and scores get recalculated when world records move. Your score and rank can change without you doing anything, and a run on a retired or re-versioned trial may stop counting. That is the leaderboard working as intended, not a mistake.
        </p>
      </SectionCard>

      <SectionCard title="Deleting or deactivating your account">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Deactivating is reversible. It hides your account from the player listings, and logging in with Discord again undoes it.
          </p>
          <p>
            Deleting is not. It logs you out, removes your Discord ID and avatar, your IP records, and your login tokens, and renames your public profile to Deleted Account. Your submissions, scores, PBs, WRs, and proof videos stay up under that name — removing them would rewrite everyone else&apos;s leaderboard history too.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Other people's services">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            The site leans on Discord for login and community features, Cloudflare for hosting, the database, and video storage, and proof providers like Medal when you submit a link. There are no ads and no analytics.
          </p>
          <p>
            They all have their own terms, and they can go down, change, or handle your data however their own policies allow. That part is not something we can answer for.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="No guarantees">
        <p className="text-sm leading-6 text-muted-foreground">
          This is a community project provided as-is. We try to keep it accurate and online, but outages happen, data gets lost, moderators make mistakes, and leaderboards get recalculated. Do not treat this site as the only copy of anything you care about.
        </p>
      </SectionCard>

      <SectionCard title="Governing law">
        <p className="text-sm leading-6 text-muted-foreground">
          These Terms are governed by the laws of Finland, except where consumer protection, privacy, or data protection law where you live says otherwise.
        </p>
      </SectionCard>
    </PageShell>
  )
}
