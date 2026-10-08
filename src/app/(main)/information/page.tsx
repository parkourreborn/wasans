import type { Metadata } from "next"
import Link from "next/link"
import { DISCORD_INVITE_URL } from "@/components/site/nav-items"
import { PageHeader } from "@/components/site/page-header"
import { TierLabel } from "@/components/site/tier-label"
import { TIERS } from "@/lib/tiers"

export const metadata: Metadata = { title: "Scoring & FAQ" }

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className = "text-foreground underline decoration-primary underline-offset-4 hover:text-primary"
  return href.startsWith("http") ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

const scoreSteps = [
  {
    title: "Each trial scores 0 to 1",
    body: "Bronze time is 0.000, platinum is 0.300, and the current world record is 1.000. Past platinum it climbs on a curve, so the last tenths of a second near the WR are worth the most.",
  },
  {
    title: "Your score is the average",
    body: "Your trial scores are averaged across every active trial. A trial you haven't submitted counts as 0, so a time on every trial always helps.",
  },
  {
    title: "It moves when WRs move",
    body: "Everything is measured against the current WRs. When a new WR is approved, everyone's score on that trial is recalculated, usually a little lower.",
  },
]

const scaleMarks = [
  { at: "0%", value: "0.000", label: "Bronze", color: "var(--bronze)" },
  { at: "30%", value: "0.300", label: "Platinum", color: "var(--tier-platinum)" },
  { at: "100%", value: "1.000", label: "World record", color: "var(--gold)" },
]

const applicationSteps: React.ReactNode[] = [
  <>
    Estimate your score on the <TextLink href="/calculator">calculator</TextLink>, which uses the current WRs.
  </>,
  "Have proof ready for every run you're counting on.",
  <>
    Submit each run on the <TextLink href="/submit">Submit</TextLink> page so moderators can approve them directly.
  </>,
  "Once your runs are approved, staff use the resulting score to decide your role or member application.",
]

const faq: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: "What does the number in people's usernames mean?",
    answer: "It's their Wasans score, from their time trial results compared to the current world records.",
  },
  {
    question: "Where is the calculator?",
    answer: (
      <>
        On the <TextLink href="/calculator">Calculator</TextLink> page. Try what-if times, or put two players side by side.
      </>
    ),
  },
  {
    question: "Who is Wasans?",
    answer: "Wasans is a Korean player from the older Parkour Legacy era. The server name and role names grew out of community lore around that history.",
  },
  {
    question: "How do I invite people?",
    answer: (
      <>
        Use the Discord invite shared by staff. The server&apos;s rules post has the active one:{" "}
        <TextLink href={DISCORD_INVITE_URL}>discord.gg/9pnRYDU6wg</TextLink>.
      </>
    ),
  },
  {
    question: "Where are the rules for runs and clips?",
    answer: (
      <>
        On the <TextLink href="/rules">Rules</TextLink> page, along with the FAQ about glitches, video quality, and hudzell pain.
      </>
    ),
  },
]

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1 border-b border-line pb-3">
        <h2 id={id} className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

export default function InformationPage() {
  const ranked = [...TIERS].reverse()

  return (
    <>
      <PageHeader
        title="Scoring & FAQ"
        description="How the Wasans score works, the tiers it puts you in, and answers to the questions people ask most."
        actions={
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/calculator", label: "Calculator" },
              { href: "/trials", label: "World records" },
              { href: "/leaderboard", label: "Leaderboard" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="label-caps flex h-9 items-center rounded-md border border-line-strong px-3 text-[14px] text-muted-foreground transition-colors hover:border-[#5a5a5a] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pb-16 pt-8">
        <Section id="score-title" title="How your score works" description="Higher is better. 1.000 would mean holding every current world record.">
          <figure className="m-0 flex flex-col gap-2" aria-label="Trial score scale: bronze 0.000, platinum 0.300, world record 1.000">
            <div className="flex h-3 overflow-hidden rounded-sm">
              <span className="w-[30%]" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--bronze) 55%, transparent), color-mix(in srgb, var(--tier-platinum) 55%, transparent))" }} />
              <span className="flex-1" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--tier-platinum) 55%, transparent), var(--gold))" }} />
            </div>
            <div className="relative h-11">
              {scaleMarks.map((mark, index) => (
                <div
                  key={mark.label}
                  className="absolute top-0 flex flex-col"
                  style={{
                    left: mark.at,
                    transform: index === 0 ? "none" : index === scaleMarks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                    alignItems: index === 0 ? "flex-start" : index === scaleMarks.length - 1 ? "flex-end" : "center",
                  }}
                >
                  <span className="num whitespace-nowrap text-[14px] font-semibold">{mark.value}</span>
                  <span className="label-caps whitespace-nowrap text-[13px]" style={{ color: mark.color }}>
                    {mark.label}
                  </span>
                </div>
              ))}
            </div>
          </figure>
          <ol className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-line bg-line p-0 md:grid-cols-3">
            {scoreSteps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2 bg-surface p-5">
                <span className="font-display text-[40px] font-extrabold leading-[0.8] text-primary">{index + 1}</span>
                <h3 className="label-caps mt-2 text-[17px]">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="tiers-title" title="Tiers" description="Your score puts you in a tier. Each tier is also a role in the Discord, given out automatically.">
          <div className="border-t border-line">
            <div className="label-caps grid h-9 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem] items-center gap-3 border-b border-line px-3 text-[13px] text-subtle-foreground" aria-hidden>
              <span>Tier</span>
              <span>Discord role</span>
              <span className="text-right">Score</span>
            </div>
            <ul className="m-0 list-none p-0">
              {ranked.map((tier, index) => (
                <li
                  key={tier.key}
                  className={`grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem] items-center gap-3 border-b border-[#1c1c1c] px-3 ${index % 2 === 1 ? "bg-surface" : ""}`}
                >
                  <TierLabel tier={tier} />
                  <span className="truncate text-[15px] text-muted-foreground">@{tier.roleName}</span>
                  <span className="num text-right text-[15px]">{tier.min > 0 ? `${tier.min.toFixed(3)}+` : "Everyone"}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="apply-title" title="Member applications" description="Becoming an official member of the server.">
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex flex-col justify-center gap-2 bg-surface-2 p-5">
              <span className="label-caps text-[13px] text-subtle-foreground">You need at least</span>
              <span className="num text-[44px] font-semibold leading-none">0.300</span>
              <span className="text-[15px] text-muted-foreground">
                That&apos;s <TierLabel tier={TIERS[1]} className="text-[15px]" />, about platinum on every trial on average.
              </span>
            </div>
            <ol className="m-0 flex list-none flex-col gap-4 bg-surface p-5">
              {applicationSteps.map((step, index) => (
                <li key={index} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-[15px] leading-relaxed">
                  <span className="num text-primary">{index + 1}</span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section id="faq-title" title="FAQ">
          <div className="-mt-5 flex flex-col">
            {faq.map((item, index) => (
              <div key={item.question} className={`border-b border-[#1c1c1c] px-3 py-4 ${index % 2 === 1 ? "bg-surface" : ""}`}>
                <h3 className="mb-1.5 text-[16px] font-semibold">{item.question}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  )
}
