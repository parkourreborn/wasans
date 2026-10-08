"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { UploadIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { isVideoFile } from "@/lib/direct-upload"
import type { AuthSessionUser } from "@/lib/auth-session"
import { formatCount } from "@/lib/format"
import { openSettings, robloxLinkRequiredMessage } from "@/lib/linked-accounts"
import { refreshRunCaches } from "@/lib/moderation"
import { stashRunFiles } from "@/lib/pending-run-files"
import { formatSubmissionBanMessage, type SubmissionBanSummary } from "@/lib/submission-bans"
import { getSubmissionErrorMessage } from "@/lib/submission-errors"
import { isYoutubeUrl } from "@/lib/submission-input"
import { cn } from "@/lib/utils"
import { getYoutubeEmbedId } from "@/lib/youtube"
import { invalidateApi, useApi } from "@/hooks/use-api"
import { useComboCategories } from "@/hooks/use-combo-categories"
import { usePageFileDrop } from "@/hooks/use-page-file-drop"
import { useAuthSession } from "@/components/custom/use-auth-session"
import { useLoginDialog } from "@/components/site/login-dialog"
import { PageHeader } from "@/components/site/page-header"
import { TrialRunsForm } from "@/components/site/trial-runs-form"
import { YoutubeEmbed } from "@/components/site/youtube-embed"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"

type AuthMeResponse = {
  data?: { submission_ban?: SubmissionBanSummary | null; roblox_link_required?: boolean }
}

// /submit: trial runs by default, a combo with ?type=combo.
export function SubmitPage() {
  const searchParams = useSearchParams()
  const type = searchParams.get("type") === "combo" ? "combo" : "trial"
  const { status, user } = useAuthSession()
  const router = useRouter()
  const { openLogin } = useLoginDialog()

  // The trial runs form takes dropped videos itself. Anywhere else on this
  // page they're caught here rather than opened by the browser: on the combo
  // tab they switch over to trial runs, and logged out they ask to log in.
  usePageFileDrop((files) => {
    const videos = files.filter(isVideoFile)
    if (videos.length === 0) {
      toast.error("Only videos can be dropped here.")
      return
    }
    if (!user) {
      openLogin("Log in to submit runs.")
      return
    }
    stashRunFiles(videos)
    if (type === "combo") {
      toast("Combos use a YouTube link, so those videos were added as trial runs.")
      router.replace("/submit", { scroll: false })
    }
  }, !(user && type === "trial"))

  return (
    <>
      <PageHeader
        title="Submit"
        description={
          type === "trial"
            ? "Send in new PBs with the video. A moderator checks each run before it counts."
            : "Send in a combo with its YouTube video. A moderator checks it before it counts."
        }
      >
        <nav aria-label="What to submit" className="flex gap-1">
          {(
            [
              { key: "trial", label: "Trial runs", href: "/submit" },
              { key: "combo", label: "Combo", href: "/submit?type=combo" },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              replace
              scroll={false}
              aria-current={tab.key === type ? "page" : undefined}
              className={cn(
                "label-caps flex h-10 items-center rounded-md border px-4 text-[15px] transition-colors",
                tab.key === type
                  ? "border-foreground bg-foreground text-background"
                  : "border-line-strong text-muted-foreground hover:border-[#5a5a5a] hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6">
        {user ? (
          <SignedInSubmit user={user} type={type} />
        ) : status === "anonymous" ? (
          <LoginPrompt />
        ) : status === "unknown" ? (
          <p className="text-[15px] text-muted-foreground">
            Couldn&apos;t check whether you&apos;re logged in.{" "}
            <button type="button" className="underline underline-offset-4" onClick={() => window.location.reload()}>
              Try again
            </button>
          </p>
        ) : (
          <SubmitSkeleton />
        )}
      </div>
    </>
  )
}

export function SubmitSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true">
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function LoginPrompt() {
  const { openLogin } = useLoginDialog()
  return (
    <section className="flex max-w-xl flex-col items-start gap-4 rounded-lg border border-line bg-surface p-6">
      <h2 className="label-caps text-2xl">Log in to submit</h2>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Runs are tied to your account, so your PBs count toward your score and moderators can message you about them.
      </p>
      <Button onClick={() => openLogin("Log in to submit a run.")}>Log in</Button>
    </section>
  )
}

function Notice({ tone = "danger", children }: { tone?: "danger" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "mb-6 flex flex-col items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tone === "danger" ? "border-destructive/40 bg-destructive/10 text-foreground" : "border-line bg-surface text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

function SignedInSubmit({ user, type }: { user: AuthSessionUser; type: "trial" | "combo" }) {
  const { data, loading } = useApi<AuthMeResponse>(apiV2("/auth/me"))
  const ban = data?.data?.submission_ban ?? null
  const robloxRequired = Boolean(data?.data?.roblox_link_required)

  if (loading) return <SubmitSkeleton />

  if (ban) {
    return (
      <Notice>
        <p className="m-0">{formatSubmissionBanMessage(ban.reason)}</p>
      </Notice>
    )
  }

  return (
    <>
      {robloxRequired ? (
        <Notice>
          <p className="m-0">{robloxLinkRequiredMessage}</p>
          <Button type="button" variant="outline" size="sm" onClick={openSettings}>
            Open settings
          </Button>
        </Notice>
      ) : null}
      {type === "trial" ? <TrialRunsForm user={user} blocked={robloxRequired} /> : <ComboForm user={user} blocked={robloxRequired} />}
    </>
  )
}

type ComboPb = { category_slug: string; combo_count: number }
type PlayerComboResponse = { data?: { player?: { combo_pbs?: ComboPb[] } | null } }
type CreateComboResponse = { data?: { results?: Array<{ uuid: string }> }; error?: { message?: string } }

function ComboForm({ user, blocked }: { user: AuthSessionUser; blocked: boolean }) {
  const router = useRouter()
  const { categories, loading: categoriesLoading } = useComboCategories()
  const playerUrl = apiV2(`/players/${encodeURIComponent(user.uuid)}?include=combo_pbs`)
  const { data: playerData } = useApi<PlayerComboResponse>(playerUrl)
  const [category, setCategory] = useState("")
  const [count, setCount] = useState("")
  const [link, setLink] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const best = playerData?.data?.player?.combo_pbs?.find((entry) => entry.category_slug === category)
  const parsedCount = /^\d+$/.test(count) ? Number(count) : null
  const linkValid = isYoutubeUrl(link) && getYoutubeEmbedId(link.trim()) !== null
  const issues = {
    category: category ? null : "Choose the category.",
    count: parsedCount !== null && parsedCount > 0 ? null : "Enter the combo count as a whole number.",
    link: !link.trim() ? "Paste the YouTube link." : linkValid ? null : "That isn't a YouTube video link.",
  }
  const ready = !issues.category && !issues.count && !issues.link

  const submit = async () => {
    setAttempted(true)
    setError(null)
    if (!ready || blocked || submitting) return
    setSubmitting(true)
    try {
      const response = await fetch(apiV2("/combo-submissions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category_slug: category, combo_count: parsedCount, youtube_url: link.trim() }),
      })
      const json = (await response.json().catch(() => null)) as CreateComboResponse | null
      if (!response.ok) {
        setError(getSubmissionErrorMessage(json?.error, "Couldn't submit the combo. Try again."))
        setSubmitting(false)
        return
      }
      refreshRunCaches("combo")
      invalidateApi(playerUrl)
      const uuid = json?.data?.results?.[0]?.uuid
      router.push(uuid ? `/submissions/${encodeURIComponent(uuid)}` : "/submissions/combos")
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <details className="group rounded-lg border border-line bg-surface px-4 py-3">
          <summary className="label-caps cursor-pointer list-none text-[14px] text-muted-foreground marker:hidden group-open:text-foreground">
            Before you submit
          </summary>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The clip runs from 0 combo all the way to the count you&apos;re submitting.</li>
            <li>Your username is visible, and the final count shows in chat or on your profile.</li>
            <li>Combos under 100k score aren&apos;t accepted, and clips can&apos;t be longer than 25 minutes.</li>
          </ul>
          <Link href="/rules" className="mt-2 inline-block text-sm underline underline-offset-4">
            Read all the rules
          </Link>
        </details>
        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <section aria-label="Combo" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="combo-category" className="label-caps text-[13px] text-subtle-foreground">
                Category
              </Label>
              <Select value={category || undefined} onValueChange={setCategory} disabled={submitting || categoriesLoading}>
                <SelectTrigger id="combo-category" className="h-10 w-full" aria-invalid={Boolean(attempted && issues.category)}>
                  <SelectValue placeholder={categoriesLoading ? "Loading…" : "Choose a category"} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {attempted && issues.category ? <p className="text-[13px] text-destructive">{issues.category}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="combo-count" className="label-caps text-[13px] text-subtle-foreground">
                Combo
              </Label>
              <Input
                id="combo-count"
                inputMode="numeric"
                autoComplete="off"
                placeholder="142"
                value={count}
                onChange={(event) => {
                  if (/^\d{0,7}$/.test(event.target.value)) setCount(event.target.value)
                }}
                aria-invalid={Boolean(attempted && issues.count)}
                disabled={submitting}
                className="num h-10 text-[16px]"
              />
              {attempted && issues.count ? <p className="text-[13px] text-destructive">{issues.count}</p> : null}
            </div>
          </div>
          {category && parsedCount ? (
            <p className="text-sm text-muted-foreground">
              {best ? (
                <>
                  Your best here is <span className="num text-foreground">{formatCount(best.combo_count)}</span>
                  {parsedCount > best.combo_count ? (
                    <span className="num text-success"> (+{formatCount(parsedCount - best.combo_count)})</span>
                  ) : (
                    <span>. This one won&apos;t beat it.</span>
                  )}
                </>
              ) : (
                "This would be your first combo in this category."
              )}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="combo-link" className="label-caps text-[13px] text-subtle-foreground">
              YouTube link
            </Label>
            <Input
              id="combo-link"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              aria-invalid={Boolean((attempted || link.trim()) && issues.link)}
              disabled={submitting}
              className="h-10"
            />
            {(attempted || link.trim()) && issues.link ? <p className="text-[13px] text-destructive">{issues.link}</p> : null}
          </div>
          {linkValid ? <YoutubeEmbed url={link.trim()} title="Your combo video" /> : null}
        </section>
      </div>

      <aside
        aria-label="Submit"
        className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 lg:top-20 lg:mx-0 lg:rounded-lg lg:border lg:bg-surface lg:p-4"
      >
        <Button type="button" size="lg" className="w-full" disabled={blocked || submitting} onClick={() => void submit()}>
          {submitting ? <Spinner className="size-4" /> : <UploadIcon />}
          {submitting ? "Submitting…" : "Submit combo"}
        </Button>
        {attempted && !ready ? (
          <p className="text-[13px] text-destructive">Fill in the marked fields first.</p>
        ) : (
          <p className="hidden text-[13px] leading-relaxed text-subtle-foreground lg:block">
            The combo starts as pending until a moderator watches the video.
          </p>
        )}
      </aside>
    </div>
  )
}
