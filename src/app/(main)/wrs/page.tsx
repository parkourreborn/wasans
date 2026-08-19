"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { apiV1 } from "@/lib/api"
import { trials } from "@/lib/trials"
import { SubmissionCard } from "@/components/custom/submission-card"
import { PageHeader, PageShell, SubmissionList } from "@/components/custom/page-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { HistoryIcon } from "lucide-react"

type Submission = {
  submission_uuid: string
  player_uuid: string
  player_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  trial_name: string
  player_name: string
  player_score: number
  time: number
  date: string
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
}

type HistoryRow = Omit<Submission, "submission_uuid"> & {
  uuid: string
}

type SubmissionsResponse = {
  results: Submission[]
}

type HistoryResponse = {
  results: HistoryRow[]
}

type CachedWrs = {
  results: Submission[]
  timestamp: number
}

const WR_CACHE_KEY = "wasans_wrs_cache"
const submissionUuidListKey = "submission_uuids"

const trialOrderByName = new Map(trials.map((trial, index) => [trial.toUpperCase(), index]))

function compareByTrialOrder(aTrialName: string, bTrialName: string) {
  const aOrder = trialOrderByName.get(String(aTrialName).toUpperCase())
  const bOrder = trialOrderByName.get(String(bTrialName).toUpperCase())

  if (aOrder == null && bOrder == null) {
    return aTrialName.localeCompare(bTrialName)
  }

  if (aOrder == null) {
    return 1
  }

  if (bOrder == null) {
    return -1
  }

  return aOrder - bOrder
}

function formatTime(rawTime: number | string) {
  const timeStr = String(rawTime)
  const match = timeStr.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return timeStr
  }

  const [, seconds, ms] = match
  const formattedMs = ms.padEnd(3, "0")
  return `${String(Number(seconds))}.${formattedMs}`
}

function formatDate(timestamp: string) {
  const unixTime = parseInt(timestamp, 10)
  if (isNaN(unixTime)) {
    return timestamp
  }

  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const year = date.getFullYear()
  return `${month}-${day}-${year}`
}

function toSubmission({ uuid, ...rest }: HistoryRow): Submission {
  return { ...rest, submission_uuid: uuid }
}

function loadCachedSubmissions() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(WR_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedWrs
    return Array.isArray(parsed?.results) ? parsed.results : null
  } catch {
    return null
  }
}

export default function SubmissionsPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [historyOn, setHistoryOn] = useState(false)
  const [history, setHistory] = useState<Record<string, Submission[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const wrIds = useMemo(() => {
    return new Set(submissions.map((submission) => submission.submission_uuid))
  }, [submissions])

  const orderedSubmissions = useMemo(() => {
    const current = [...submissions].sort((a, b) => compareByTrialOrder(a.trial_name, b.trial_name))

    if (!historyOn) {
      return current
    }

    return current.flatMap((submission) => {
      const past = history[submission.trial_name] || []
      const hasCurrent = past.some((row) => row.submission_uuid === submission.submission_uuid)
      return hasCurrent ? past : [submission, ...past]
    })
  }, [submissions, historyOn, history])

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return orderedSubmissions
    }

    return orderedSubmissions.filter((submission) =>
      submission.trial_name.toLowerCase().includes(normalizedQuery)
    )
  }, [searchQuery, orderedSubmissions])

  useEffect(() => {
    if (typeof window === "undefined" || loading) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(filteredSubmissions.map((submission) => submission.submission_uuid))
    )
  }, [filteredSubmissions, loading])

  useEffect(() => {
    if (!historyOn || Object.keys(history).length) {
      return
    }

    const fetchHistory = async () => {
      setHistoryLoading(true)

      try {
        const entries = await Promise.all(
          trials.map(async (trial) => {
            const response = await fetch(apiV1(`/records/world/history/${encodeURIComponent(trial)}`), {
              cache: "no-cache",
            })

            if (!response.ok) {
              return [trial, []] as const
            }

            const json = (await response.json()) as HistoryResponse
            return [trial, (json.results || []).map(toSubmission).reverse()] as const
          })
        )

        setHistory(Object.fromEntries(entries))
      } catch (err) {
        console.error(err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [historyOn, history])

  useEffect(() => {
    const cachedResults = loadCachedSubmissions()

    if (cachedResults?.length) {
      setSubmissions(cachedResults)
      setLoading(false)
    }

    const fetchSubmissions = async () => {
      try {
        const response = await fetch(apiV1("/records/world"), { cache: "no-cache" })
        if (!response.ok) {
          if (!cachedResults) {
            setError("Failed to load submissions")
          }
          return
        }

        const json = (await response.json()) as SubmissionsResponse
        const results = json.results || []
        setSubmissions(results)

        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            WR_CACHE_KEY,
            JSON.stringify({ results, timestamp: Date.now() })
          )
        }
      } catch (err) {
        if (!cachedResults) {
          setError("Error loading submissions")
        }
        console.error(err)
      } finally {
        if (!cachedResults) {
          setLoading(false)
        }
      }
    }

    fetchSubmissions()
  }, [])

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          title="World Records"
        />
        <div className="rounded-3xl border border-border/60 bg-background/55 p-4 backdrop-blur-xl">
          <Skeleton className="h-10 w-full md:w-72" />
        </div>

        <SubmissionList className="submissions-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="submission-grid-item">
              <Card className="h-full overflow-hidden border-border/60 bg-background/55">
                <CardContent className="flex h-full min-h-0 gap-4 p-4">
                  <Skeleton className="flex-1 rounded-lg" />
                  <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-5 w-24" />
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </SubmissionList>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-border/60 bg-background/55 p-6 text-sm text-destructive backdrop-blur-xl">
          Unable to load the record board right now.
          <div className="mt-2">{error}</div>
        </div>
      </PageShell>
    )
  }

  if (submissions.length === 0) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-border/60 bg-background/55 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          No approved world records are available yet.
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="World Records" />

      <div className="sticky top-14 z-30 rounded-3xl border border-border/60 bg-background/80 p-4 backdrop-blur-xl md:top-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by trial name"
            aria-label="Search world records by trial name"
            className="h-10 w-full min-w-0 sm:flex-1"
          />

          <Toggle
            variant="outline"
            size="lg"
            pressed={historyOn}
            onPressedChange={setHistoryOn}
            disabled={historyLoading}
            aria-label="Show past world records"
            className="h-10 w-full cursor-pointer sm:w-auto sm:shrink-0"
          >
            {historyLoading ? <Spinner className="size-4" /> : <HistoryIcon />}
            History
          </Toggle>
        </div>
      </div>

      <SubmissionList className="submissions-grid">
        {filteredSubmissions.length === 0 ? (
          <div className="flex min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 backdrop-blur-xl">
            <p className="text-muted-foreground">No matching world records</p>
          </div>
        ) : (
          filteredSubmissions.map((submission) => (
            <SubmissionCard
              key={submission.submission_uuid}
              submissionUuid={submission.submission_uuid}
              trialName={submission.trial_name}
              timeText={formatTime(submission.time)}
              playerUuid={submission.player_uuid}
              playerName={submission.player_name}
              playerScore={submission.player_score}
              playerId={submission.player_id}
              playerDiscordAvatar={submission.discord_avatar}
              playerDiscordDiscriminator={submission.discord_discriminator}
              dateText={formatDate(submission.date)}
              state="approved"
              isWr={wrIds.has(submission.submission_uuid)}
              moderatorNote={submission.moderator_note}
              moderatorUsername={submission.moderator_username}
              className="h-full cursor-pointer overflow-hidden border-border/60 bg-background/55 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_24px_52px_-34px_rgba(0,0,0,0.85)]"
              onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
            />
          ))
        )}
      </SubmissionList>
    </PageShell>
  )
}
