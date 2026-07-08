import type { Metadata } from "next"
import Link from "next/link"
import { PageShell, SectionCard } from "@/components/custom/page-shell"
import { legalContactEmail, legalUpdatedLabel } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Privacy Policy | wasans",
  description: "Privacy details for the Wasans website.",
}

const discordData = [
  "Discord user ID",
  "Discord username or display name",
  "Discord avatar hash and discriminator when Discord provides them",
  "Discord OAuth access token, refresh token, and token expiry",
]

const accountData = [
  "Internal player UUID",
  "Player name, score, permission level, and date joined",
  "Account status, deactivation/deletion time, and terms/privacy acceptance timestamp",
  "Session tokens used to keep you logged in",
]

const publicData = [
  "Player profiles, names, avatars, scores, ranks, and join dates",
  "Submissions, times, trials, states, moderator notes, and moderators shown on submissions",
  "Personal bests, world records, public score videos, and Discord submission thread links when used",
]

const legalBasis = [
  "Account/login data is processed to provide the Discord login/account service.",
  "Public scores, submissions, proof videos, PBs, WRs, and leaderboard data are processed to provide the community leaderboard and submission system.",
  "Security logs, audit logs, moderation notes, and error logs are processed for legitimate interests such as security, abuse prevention, moderation, debugging, and protecting the integrity of the leaderboard.",
  "Deletion and privacy requests are processed to comply with legal obligations.",
]

const retentionItems = [
  "Account/login data is kept while the account exists.",
  "OAuth tokens and sessions are removed when the account is deleted.",
  "Public submissions, scores, PBs, WRs, and proof videos may remain after deletion because they are part of the public leaderboard/archive.",
  "Deleted accounts are shown as Deleted Account.",
  "Logs are kept only as long as reasonably needed for security, moderation, debugging, and audit purposes.",
  "Data may be kept longer if needed to handle abuse, disputes, security issues, or legal obligations.",
]

const userRights = [
  "Access to your data",
  "Correction of inaccurate data",
  "Deletion",
  "Restriction",
  "Objection",
  "Portability, where applicable",
]

const localStorageItems = [
  "A session cookie for logged-in accounts",
  "Short-lived Discord OAuth state cookies during login",
  "Sidebar and UI preference storage",
  "Calculator inputs, cached leaderboard data, and recently viewed submission IDs",
]

export default function PrivacyPage() {
  return (
    <PageShell className="max-w-4xl">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated {legalUpdatedLabel}.</p>
      </div>

      <SectionCard title="Who to contact">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            The controller/operator for this site is currently <span className="font-medium text-foreground">The Wasans website operators and project maintainers</span>. There is no formal company or legal entity yet, so this may be updated if the project structure changes.
          </p>
          <p>
            For privacy questions, account deletion, or data requests, email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Discord login data">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>When you log in with Discord, the site requests Discord&apos;s identify scope and may store:</p>
          <ul className="list-disc space-y-2 pl-5">
            {discordData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Discord login is used to create your player account, keep you signed in, connect submissions to your player profile, and support moderation/community features.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Account data">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {accountData.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Public data">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>Some site data is meant to be public so the leaderboard and submission archive work:</p>
          <ul className="list-disc space-y-2 pl-5">
            {publicData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Public submissions, scores, and videos can stay public after account deletion. Deleted accounts are shown as Deleted Account.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Legal basis">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {legalBasis.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Submissions and proof videos">
        <p className="text-sm leading-6 text-muted-foreground">
          When you submit a run, the site stores the trial, time, submission state, player information, and proof video. Uploaded videos and videos fetched from supported proof links are stored in the site&apos;s video storage and may be publicly viewable.
        </p>
      </SectionCard>

      <SectionCard title="Logs and security data">
        <p className="text-sm leading-6 text-muted-foreground">
          The site stores audit logs for submissions, moderation, world record changes, and site errors. Error logs can include the page path, browser user agent, error message, stack trace, and your logged-in account if the error happened while you were signed in.
        </p>
      </SectionCard>

      <SectionCard title="Cookies and browser storage">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>The site uses cookies and browser storage for login, security, preferences, and cached UI data:</p>
          <ul className="list-disc space-y-2 pl-5">
            {localStorageItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            The site does not currently use advertising or marketing cookies. If that changes, the project maintainers should add a consent flow before using non-essential tracking.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Data retention">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {retentionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Third-party services">
        <p className="text-sm leading-6 text-muted-foreground">
          The site uses Discord for login and community features, Cloudflare for hosting/database/video storage, and proof providers like Medal when resolving submitted proof links. These services may process data under their own policies.
        </p>
      </SectionCard>

      <SectionCard title="International transfers">
        <p className="text-sm leading-6 text-muted-foreground">
          Third-party services such as Discord, Cloudflare, and proof/video providers may process data outside the EU/EEA. Where required, appropriate safeguards or lawful transfer mechanisms should be used.
        </p>
      </SectionCard>

      <SectionCard title="Deletion and deactivation">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            You can deactivate your account in Settings. Deactivation hides the account from normal player listings and is reversible by logging in with Discord again.
          </p>
          <p>
            You can delete your account in Settings or request deletion by emailing{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>. Deletion removes Discord login data, OAuth tokens, active sessions, and personal account identity from the account row. Public submissions, scores, PBs, WRs, and proof videos stay available as Deleted Account.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Age">
        <p className="text-sm leading-6 text-muted-foreground">
          Our website is not intended for children under the age of 13. By logging in via Discord, you confirm that you meet Discord&apos;s minimum age requirements.
        </p>
      </SectionCard>

      <SectionCard title="Your choices and rights">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            You can use public pages without logging in. If you log in, you can manage account deactivation or deletion in Settings. You can also email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>{" "}
            to request:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {userRights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Some rights may have limits, especially for public leaderboard/submission records, moderation integrity, security, or legal reasons. You may complain to your local data protection authority, or in Finland to the Office of the Data Protection Ombudsman.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Terms">
        <p className="text-sm leading-6 text-muted-foreground">
          The rules for using the site are in the{" "}
          <Link href="/terms" className="text-primary underline underline-offset-4">Terms of Service</Link>.
        </p>
      </SectionCard>
    </PageShell>
  )
}
