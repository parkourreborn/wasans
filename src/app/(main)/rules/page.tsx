import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/site/page-header"

export const metadata: Metadata = { title: "Rules" }

type Rule = {
  text: React.ReactNode
  details?: React.ReactNode[]
}

type RuleSection = {
  id: string
  title: string
  summary: string
  rules: Rule[]
}

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

// Numbered so moderators can point at one ("denied per 3.2"). Every rule
// number links to its own anchor, so a rule can be shared directly.
const sections: RuleSection[] = [
  {
    id: "runs",
    title: "Run rules",
    summary: "What's allowed during the run itself.",
    rules: [
      {
        text: (
          <>
            Any glitches are prohibited. This one exists as a wildcard; the ones currently banned are listed under{" "}
            <TextLink href="#glitches">Banned glitches</TextLink>.
          </>
        ),
      },
      { text: "Using autoparkour or autotransition is prohibited and automatically invalidates the run." },
      { text: "No autoclickers or macros." },
      { text: "Practice mode is not allowed." },
    ],
  },
  {
    id: "glitches",
    title: "Banned glitches",
    summary: "The current list. Anything not on it is still covered by rule 1.1.",
    rules: [
      { text: "Any form of teleportation glitch." },
      {
        text: "Double vaulting.",
        details: ["Only doable via autoparkour, so it's banned regardless."],
      },
      {
        text: "Coil slide on a slope.",
        details: [
          "Extremely buggy, and can give a random speed boost depending on your FPS.",
          "The run is still invalid if a slope coil slide happens on flat ground or a non-steep slope because of a glitch.",
        ],
      },
      {
        text: (
          <>
            Moves that aren&apos;t technically possible, such as the &quot;wasans boost&quot; (
            <TextLink href="https://medal.tv/games/roblox/clips/iCCXCbgiOucnem5Qx">example clip</TextLink>).
          </>
        ),
      },
      {
        text: (
          <>
            Afterboost overriding your current velocity, also known as &quot;drophop&quot; (
            <TextLink href="https://discord.com/channels/1257994787512913961/1258043364021108756/1453104539778682991">
              example on Discord
            </TextLink>
            ).
          </>
        ),
      },
    ],
  },
  {
    id: "video",
    title: "Video requirements",
    summary: "What your clip has to show for the run to count.",
    rules: [
      {
        text: (
          <>
            The clip must include the entire run, along with the actual time after exiting the trial. Didn&apos;t beat your PB?
            See <TextLink href="#faq-hudzell">hudzell pain</TextLink>.
          </>
        ),
      },
      {
        text: "The clip must clearly show:",
        details: ["A properly visible timer", "Your username", "The game build number at the bottom of the screen"],
      },
      {
        text: "No overlays may cover the footage: images, PNGs, videos, stream layouts, text, or anything else drawn over the video.",
        details: ["Handcams and keyboard overlays are fine (up to moderator discretion)."],
      },
      {
        text: "Video quality is on you. If the necessary details aren't clearly visible, the run may be rejected at the score moderator's discretion.",
      },
      { text: "Cut the clip tight enough that the start, run, and finish are convincing, without cutting any of the required details." },
    ],
  },
  {
    id: "submitting",
    title: "Submitting runs",
    summary: "How to send a run in, and what the site checks.",
    rules: [
      { text: "Upload the video file, or paste a Medal clip link." },
      { text: "Enter your time with no more than three decimal places." },
      { text: "Your time has to at least reach the trial's gold medal time." },
      { text: "You can't submit a time slower than your current PB, so your record stays clean." },
      {
        text: (
          <>
            You can send several runs at once from the <TextLink href="/submit">Submit</TextLink> page. Drop your videos anywhere on
            it and each one becomes a run.
          </>
        ),
      },
      {
        text: "World-record runs must be submitted within an acceptable amount of time after they were recorded.",
        details: [
          "Normal life delays are fine, like being on vacation or going to bed right after the run.",
          "\"Acceptable\" means acceptable to other members. Wanting to gatekeep it, or forgetting to upload it for a week (or some dumb long time), doesn't count.",
        ],
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts",
    summary: "Who can submit.",
    rules: [
      { text: "If you're permanently banned from the game, you can't submit runs. This is to comply with the main game rule." },
      { text: "Alt accounts are allowed ONLY if you're not ban evading." },
      {
        text: "Staff can ban a player from submitting. A banned player keeps their account, approved runs, and score, but can't submit anything new until the ban is lifted.",
      },
    ],
  },
  {
    id: "combos",
    title: "Combo rules",
    summary: "What makes a combo leaderboard submission valid.",
    rules: [
      { text: "The clip must show the full combo, from 0 all the way to the count you're submitting." },
      { text: "Your username must be visible, and the final combo count must show in chat (or on your profile if chat doesn't post it)." },
      { text: "Combos under 100k score won't be accepted." },
      { text: "Clips longer than 25 minutes aren't allowed, to save the moderators' dignity." },
      { text: "Combos are submitted with a YouTube link." },
    ],
  },
  {
    id: "moderation",
    title: "Moderation",
    summary: "How moderators handle submissions.",
    rules: [
      { text: "Every submission starts as pending. Moderators can move it between pending, approved, and denied at any time." },
      { text: "If a run is technically within the rules but is exploiting a loophole, it can still be rejected." },
      { text: "Moderators can reject a score for any reason, without explanation." },
    ],
  },
]

const faq: Array<{ id: string; question: string; answer: React.ReactNode }> = [
  {
    id: "faq-glitch",
    question: "What counts as a \"glitch\"?",
    answer: (
      <p>
        &quot;Any glitches are prohibited&quot; only exists as a wildcard. The ones actually banned right now are listed under{" "}
        <TextLink href="#glitches">Banned glitches</TextLink>.
      </p>
    ),
  },
  {
    id: "faq-macro",
    question: "Can I autoclick or macr-",
    answer: <p>No.</p>,
  },
  {
    id: "faq-quality",
    question: "My video quality is low. Is this fine?",
    answer: (
      <p>
        If the necessary details aren&apos;t clearly visible, your run may be rejected at the score moderator&apos;s discretion. If you
        want to keep your bitrate low, that&apos;s on you.
      </p>
    ),
  },
  {
    id: "faq-hudzell",
    question: "I didn't beat my PB. How do I show my actual time?",
    answer: (
      <div className="flex flex-col gap-4">
        <p>
          The actual time after exiting the trial isn&apos;t shown when you don&apos;t beat your PB. Open the developer console (F9)
          and search for{" "}
          <code className="num rounded-sm bg-surface-3 px-1.5 py-0.5 text-[13px] text-foreground">
            hudzell&apos;s great pain reduced your time by (time)
          </code>
          . Subtract that from your timer time, then round to three decimals.
        </p>
        <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
          {[
            { label: "Positive pain", sum: "6.974 − 0.0004292 = 6.9735708" },
            { label: "Negative pain (yes, it can go negative)", sum: "6.974 − (−0.0004292) = 6.9744292" },
          ].map((example) => (
            <div key={example.label} className="flex flex-col gap-1.5 bg-surface p-3">
              <span className="label-caps text-[13px] text-subtle-foreground">{example.label}</span>
              <span className="num text-[13px] text-muted-foreground">{example.sum}</span>
              <span className="num text-[15px] font-semibold text-foreground">→ 6.974</span>
            </div>
          ))}
        </div>
        <p>
          Don&apos;t stress about the math. Just have both the timer time and the hudzell pain clearly visible in the clip and the
          score moderator will confirm the time. The Submit page can do the subtraction for you (&quot;Time not shown?&quot;).
        </p>
      </div>
    ),
  },
]

const navItems = [
  ...sections.map((section, index) => ({ id: section.id, number: String(index + 1), label: section.title })),
  { id: "faq", number: "?", label: "FAQ" },
]

// Clears the sticky top bar (and on phones the section strip under it)
// when jumping to an anchor.
const anchorOffset = "scroll-mt-32 lg:scroll-mt-20"

function SectionHeading({ id, mark, title, children }: { id: string; mark: string; title: string; children: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end gap-4 border-b border-line pb-3">
      <span aria-hidden className="w-8 shrink-0 font-display text-[44px] font-extrabold leading-[0.8] text-primary">
        {mark}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </header>
  )
}

export default function RulesPage() {
  return (
    <>
      <PageHeader
        title="Rules"
        description="What makes a run valid, what your clip has to show, and how moderation works. Every rule number is a link, so you can share one directly."
      >
        <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-[auto_1fr_1fr]">
          <div className="flex items-center bg-surface-2 px-4 py-3">
            <span className="label-caps text-[14px] text-primary">Too many rules? The short version</span>
          </div>
          {["Show your final time after you finish.", "Have proper video quality."].map((item, index) => (
            <div key={item} className="flex items-center gap-3 bg-surface px-4 py-3">
              <span className="font-display text-[28px] font-extrabold leading-none text-subtle-foreground">{index + 1}</span>
              <span className="text-[15px]">{item}</span>
            </div>
          ))}
        </div>
      </PageHeader>

      <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-x-10 px-4 pb-16 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Rule sections"
          className="sticky top-[57px] z-20 -mx-4 border-b border-line bg-background/95 px-4 py-2.5 backdrop-blur lg:top-20 lg:mx-0 lg:mt-8 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          <span className="label-caps mb-3 hidden text-[13px] text-subtle-foreground lg:block">On this page</span>
          <ul className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 lg:flex-col lg:gap-0 lg:overflow-visible">
            {navItems.map((item) => (
              <li key={item.id} className="shrink-0">
                <a
                  href={`#${item.id}`}
                  className="group flex items-center gap-2.5 rounded-md border border-line-strong px-2.5 py-1.5 text-[14px] text-muted-foreground transition-colors hover:border-[#5a5a5a] hover:text-foreground lg:rounded-none lg:border-0 lg:border-l-2 lg:border-line lg:px-3 lg:hover:border-primary"
                >
                  <span className="num text-[12px] text-subtle-foreground group-hover:text-primary">{item.number}</span>
                  <span className="label-caps whitespace-nowrap">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-12 pt-8">
          {sections.map((section, sectionIndex) => {
            const number = sectionIndex + 1
            return (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className={anchorOffset}>
                <SectionHeading id={`${section.id}-title`} mark={String(number)} title={section.title}>
                  {section.summary}
                </SectionHeading>
                <ol className="m-0 list-none p-0">
                  {section.rules.map((rule, ruleIndex) => {
                    const ruleNumber = `${number}.${ruleIndex + 1}`
                    const anchor = `rule-${number}-${ruleIndex + 1}`
                    return (
                      <li
                        key={anchor}
                        id={anchor}
                        className={`${anchorOffset} grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-b border-[#1c1c1c] px-3 py-3.5 transition-colors target:bg-primary/10 ${ruleIndex % 2 === 1 ? "bg-surface" : ""}`}
                      >
                        <a href={`#${anchor}`} className="num pt-px text-[14px] text-subtle-foreground hover:text-primary" aria-label={`Link to rule ${ruleNumber}`}>
                          {ruleNumber}
                        </a>
                        <div className="text-[15px] leading-relaxed">
                          {rule.text}
                          {rule.details ? (
                            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted-foreground marker:text-subtle-foreground">
                              {rule.details.map((detail, detailIndex) => (
                                <li key={detailIndex}>{detail}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}

          <section id="faq" aria-labelledby="faq-title" className={anchorOffset}>
            <SectionHeading id="faq-title" mark="?" title="FAQ">
              Questions about the rules. For scores and tiers, see <TextLink href="/information">Scoring &amp; FAQ</TextLink>.
            </SectionHeading>
            <div className="flex flex-col">
              {faq.map((item, index) => (
                <div
                  key={item.id}
                  id={item.id}
                  className={`${anchorOffset} border-b border-[#1c1c1c] px-3 py-4 transition-colors target:bg-primary/10 ${index % 2 === 1 ? "bg-surface" : ""}`}
                >
                  <h3 className="mb-1.5 text-[16px] font-semibold">{item.question}</h3>
                  <div className="text-[15px] leading-relaxed text-muted-foreground">{item.answer}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
