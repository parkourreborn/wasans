import type { Metadata } from "next"
import Link from "next/link"
import { PageShell, SectionCard } from "@/components/custom/page-shell"
import { legalContactEmail, legalUpdatedLabel } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Privacy Policy | wasans",
  description: "Privacy details for the Wasans website.",
}

const discordData = [
  "Your Discord user ID",
  "Your Discord username or display name",
  "Your Discord avatar hash and discriminator, when Discord gives them to us",
]

const accountData = [
  "An internal player UUID we generate for you",
  "Your player name, score, permission level, and the date you joined",
  "Whether your account is active, deactivated, or deleted, and when that changed",
  "When you last accepted these Terms and this Privacy Policy",
  "Two login cookies: a short-lived one that proves who you are, and a longer-lived one that quietly renews it so you are not asked to sign in again every 15 minutes",
]

const publicData = [
  "Your player profile: name, avatar, score, rank, and join date",
  "Your Discord user ID, which the public API returns so the site can build your avatar image",
  "Your submissions: trial, time, state, and the moderator note and moderator name attached to them",
  "Your personal bests, any world records you hold, and the proof video for each run",
  "The link to the Discord thread for a submission, where one exists",
]

const legalBasis = [
  "We process your account and login data to give you an account at all — without it there is nothing to log in to.",
  "We process scores, submissions, proof videos, PBs, WRs, and leaderboard data to run the leaderboard, which is the whole point of the site.",
  "We process IP addresses, audit logs, moderation notes, and error logs under legitimate interests: keeping the leaderboard honest, catching ban evasion and abuse, and fixing things when they break.",
  "We process deletion and privacy requests because the law says we have to.",
]

const retentionItems = [
  "Your account data sticks around while your account does.",
  "IP records are deleted 180 days after we last saw them, and immediately if you delete your account.",
  "Login tokens are deleted when you log out or delete your account, and expired ones are cleared out about a month later.",
  "Rate-limit counters, which include a value derived from your IP, are cleared out after a day.",
  "Audit logs and moderation notes are kept indefinitely. They are the leaderboard's history — who approved what, and when — and we would not be able to settle a dispute or unpick abuse without them.",
  "Error logs are kept indefinitely too. We should trim these and have not yet.",
  "Your public submissions, scores, PBs, WRs, and proof videos can stay up after you delete your account, because they are part of the public archive. They show as Deleted Account.",
  "We may hold on to something longer if we are dealing with abuse, a dispute, a security problem, or a legal obligation.",
]

const userRights = [
  "See what we hold about you",
  "Correct anything that is wrong",
  "Have it deleted",
  "Restrict what we do with it",
  "Object to us processing it",
  "Take it elsewhere, where that applies",
]

const localStorageItems = [
  "Two cookies that keep you logged in, plus a couple of short-lived ones during the Discord login handshake",
  "Your sidebar and interface preferences",
  "Calculator inputs, cached leaderboard data, and the submission IDs you looked at recently, so the next/previous arrows work",
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
            This site is run by <span className="font-medium text-foreground">the Wasans website operators and project maintainers</span> — a small group of people, not a company. There is no legal entity behind it yet, so this page will change if that ever changes.
          </p>
          <p>
            For anything privacy-related — a question, a deletion request, or a copy of your data — email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="What Discord tells us">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>When you log in, we ask Discord for its <span className="font-medium text-foreground">identify</span> scope and keep:</p>
          <ul className="list-disc space-y-2 pl-5">
            {discordData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            The identify scope is the smallest one Discord offers. It does not include your email address, your servers, or any of your messages, and we could not read them if we wanted to.
          </p>
          <p>
            <span className="font-medium text-foreground">We do not store Discord&apos;s access or refresh tokens.</span> We use them once during login to ask Discord who you are, and then throw them away. Keeping them would mean holding credentials to your Discord account that we have no use for, so we do not.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Your account">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {accountData.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="IP addresses">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            While you are logged in, we record the IP address your requests come from, along with a first-seen and last-seen time and a count. It updates as you use the site, not just when you log in.
          </p>
          <p>
            We do this for one reason: it is the only practical way to spot someone running alternate accounts to evade a ban or pad the leaderboard. It is not used for analytics, we do not build a profile from it, and we do not share it.
          </p>
          <p>
            These records are not visible anywhere on the site — not to you, and not to moderators. Only the people who administer the database can see them, and they are deleted 180 days after we last saw the address, or straight away if you delete your account.
          </p>
          <p>
            We also count requests per IP to stop people hammering the API. Those counters include a value derived from your address and are thrown away after a day.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="What is public">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>A leaderboard only works if it is public, so most of what you put in is visible to anyone — including people who are not logged in, and through the API as well as the site:</p>
          <ul className="list-disc space-y-2 pl-5">
            {publicData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Two things worth calling out, because they surprise people. Your <span className="font-medium text-foreground">Discord user ID is public</span> — anyone can read it from the API and look you up on Discord. And a proof video is reachable by its link from the moment it is uploaded, which means <span className="font-medium text-foreground">runs that are still pending, or that were denied, can still be watched by anyone with the link</span>. If you would rather a run not be seen at all, do not submit it.
          </p>
          <p>
            Public submissions, scores, and videos can stay up after you delete your account. They show as Deleted Account.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Why we are allowed to do this">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {legalBasis.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Submissions and proof videos">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            When you submit a run we store the trial, the time, the state, who submitted it, and the proof itself. If you upload a file we keep the file; if you paste a supported proof link, we download the video from there and keep our own copy. Either way it lands in our video storage and is publicly viewable.
          </p>
          <p>
            We also generate a still frame from the video to use as a thumbnail.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="What we send to Discord">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Submitting a run posts it to our Discord server automatically, in a thread for that submission. The post includes your player name, your Discord user ID, the trial, and the time — so anyone who can see that channel can see your run before a moderator has touched it.
          </p>
          <p>
            We may also send you a Discord DM when a moderator decides on one of your runs, or when your rank changes. If your privacy settings do not allow DMs from us, the message is simply dropped.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Logs and security data">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            We keep an audit log of submissions, moderation decisions, world record changes, and permission changes — what happened, who did it, and when.
          </p>
          <p>
            We also log errors, both ours and ones your browser hits. An error log can include the full URL of the page you were on, your browser&apos;s user agent, the error message and stack trace, and your account if you were signed in at the time. We do not go looking for anything else, but a stack trace is written by the browser and we cannot promise nothing incidental ends up in one.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Cookies and browser storage">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>Here is everything we put in your browser:</p>
          <ul className="list-disc space-y-2 pl-5">
            {localStorageItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            That is the whole list. All of it is either needed for the site to work or there to remember how you like it set up, it all stays in your browser, and none of it is used to track you across other websites. There are no advertising or analytics scripts on this site.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="How long we keep things">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {retentionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Who else is involved">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Discord</span> handles login and our community features. <span className="font-medium text-foreground">Cloudflare</span> hosts the site, the database, and the video storage. <span className="font-medium text-foreground">Medal</span> and similar proof providers are involved when you submit a link and we fetch the video from them.</p>
          <p>
            That is the complete list. We do not run ads, we do not use an analytics service, and we do not sell or share your data with anyone else.
          </p>
          <p>
            Each of them handles data under their own policies, which we do not control.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Where your data goes">
        <p className="text-sm leading-6 text-muted-foreground">
          Discord, Cloudflare, and the proof providers all operate outside the EU and EEA, so your data leaves it. We rely on the transfer terms those companies publish for their own services; we are not in a position to negotiate our own with them.
        </p>
      </SectionCard>

      <SectionCard title="Deleting or deactivating your account">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Deactivating</span> is the reversible one. You can do it in Settings. It hides your account from the player listings, and logging in with Discord again brings it back.
          </p>
          <p>
            <span className="font-medium text-foreground">Deleting</span> is not reversible. You can do it in Settings, or email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>{" "}
            and we will do it for you. It removes your Discord ID and avatar, the link to your Discord account, your IP records, and every login token you have, and it renames your public profile to Deleted Account.
          </p>
          <p>
            What stays: your submissions, scores, PBs, WRs, proof videos, and the audit log entries about them, all attributed to Deleted Account. We keep those because pulling one player&apos;s runs out of a leaderboard rewrites everyone else&apos;s history too.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Age">
        <p className="text-sm leading-6 text-muted-foreground">
          This site is not meant for children under 13. By logging in with Discord you are confirming you meet Discord&apos;s minimum age for your country, which is 13 in most places and higher in some.
        </p>
      </SectionCard>

      <SectionCard title="Your rights">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            You can browse the whole public site without logging in. If you do have an account, deactivation and deletion are both in Settings. Beyond that, email{" "}
            <a href={`mailto:${legalContactEmail}`} className="text-primary underline underline-offset-4">{legalContactEmail}</a>{" "}
            and you can ask us to:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {userRights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Some of these have limits — mostly around public leaderboard records, keeping moderation decisions auditable, and security. We will tell you which limit applies rather than just declining.
          </p>
          <p>
            If we get it wrong, you can complain to your local data protection authority. In Finland that is the Office of the Data Protection Ombudsman.
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
