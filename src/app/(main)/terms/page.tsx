import type { Metadata } from "next"
import Link from "next/link"
import { PageShell, SectionCard } from "@/components/custom/page-shell"
import { legalContactEmail, legalUpdatedLabel } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Terms of Service | wasans",
  description: "Terms for using the Wasans website.",
}

const usageRules = [
  "Use the site for normal score tracking, leaderboard browsing, and submission review.",
  "Do not submit fake runs, stolen proof, malicious files, spam, or anything that breaks the game/community rules.",
  "Do not try to break, scrape, overload, or bypass the site, its API, Discord login, moderation tools, or storage.",
  "Do not impersonate other players or use someone else's Discord account.",
]

const publicDataRules = [
  "Profiles, scores, submissions, personal bests, world records, moderator notes, and proof videos may be public.",
  "By submitting a score, you confirm you have the right to share the proof and let the project maintainers host, display, review, and moderate it.",
  "Public score history may stay visible even if your account is deleted, but deleted accounts are shown as Deleted Account.",
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
            This website is operated by the website operators and project maintainers for the Wasans score and submission community.
          </p>
          <p>
            If you need to contact the project maintainers about these Terms, email{" "}
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

      <SectionCard title="Discord login">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Some features need Discord login. By logging in, you agree to these Terms and the{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-4">Privacy Policy</Link>.
          </p>
          <p>
            You are responsible for the Discord account you use. If your Discord account is compromised, you should secure it through Discord and contact the project maintainers if your site account was affected.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Public submissions and scores">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {publicDataRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Moderation">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Moderators can approve, deny, edit, hide, or remove submissions when needed. They can also add notes, fix obvious mistakes, and protect the leaderboard from abuse.
          </p>
          <p>
            The project maintainers may suspend, deactivate, or delete access if an account breaks these Terms, abuses the site, creates risk, or causes problems for the community.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Account deletion and deactivation">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Deactivation is reversible. A deactivated account is hidden from normal player listings and can be reactivated by logging in with Discord again.
          </p>
          <p>
            Deletion is permanent for account/login data. It removes Discord login data and sessions, logs you out, and changes public player information to Deleted Account. Public submissions, scores, PBs, WRs, and proof videos stay available.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Third-party services">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            The site uses third-party services such as Discord for login/community features, Cloudflare for hosting/storage/database services, and proof/video providers like Medal when you submit links or files.
          </p>
          <p>
            Those services have their own terms and policies. The project maintainers are not responsible for third-party services being unavailable, changing, or handling data under their own policies.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="No guarantees">
        <p className="text-sm leading-6 text-muted-foreground">
          The site is provided as-is for the community. The project maintainers try to keep it accurate and available, but mistakes, outages, lost data, moderation changes, or leaderboard recalculations can happen.
        </p>
      </SectionCard>

      <SectionCard title="Governing law">
        <p className="text-sm leading-6 text-muted-foreground">
          These Terms are governed by the laws of Finland, except where mandatory consumer protection, privacy, or data protection laws in your country provide otherwise.
        </p>
      </SectionCard>
    </PageShell>
  )
}
