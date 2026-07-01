"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { apiV1 } from "@/lib/api"
import { trials } from "@/lib/trials"
import Badges from "@/components/custom/badges"
import { PageHeader, PageShell, SectionCard, StatCard } from "@/components/custom/page-shell"
import { ScoreVideoPreview } from "@/components/custom/score-video-preview"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

type Submission = {
  submission_uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  player_score: number
  time: number
  date: string
  state: string
}

type SubmissionsResponse = {
  results: Submission[]
}

type CachedWrs = {
  results: Submission[]
  timestamp: number
}

const WR_CACHE_KEY = "wasans_wrs_cache"

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
  const [submissions, setSubmissions] = useState<Submission[]>(() => loadCachedSubmissions() || [])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(() => !loadCachedSubmissions()?.length)
  const [error, setError] = useState<string | null>(null)

  const orderedSubmissions = useMemo(() => {
    return [...submissions].sort((a, b) => compareByTrialOrder(a.trial_name, b.trial_name))
  }, [submissions])

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
    const cachedResults = loadCachedSubmissions()

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
        setLoading(false)
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

        <SectionCard title="Record board" contentClassName="space-y-4">
          <Skeleton className="h-10 w-full md:w-72" />
          <div className="submissions-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="submission-grid-item">
                <Card className="h-full overflow-hidden border-border/70 bg-card/80">
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
          </div>
        </SectionCard>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <SectionCard title="World records" description="Unable to load the record board right now.">
          <p className="text-destructive">{error}</p>
        </SectionCard>
      </PageShell>
    )
  }

  if (submissions.length === 0) {
    return (
      <PageShell>
        <SectionCard title="World records" description="No approved world records are available yet.">
          <p className="text-muted-foreground">No submissions yet</p>
        </SectionCard>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="World Records"
       />

      <SectionCard
        title="Record board"
        description="Filter by trial name or jump straight into the run proof."
        action={
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by trial name"
            aria-label="Search world records by trial name"
            className="h-10 min-w-0 md:w-72"
          />
        }
        contentClassName="min-h-0"
      >
        {filteredSubmissions.length === 0 ? (
          <div className="flex min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15">
            <p className="text-muted-foreground">No matching world records</p>
          </div>
        ) : (
          <div className="submissions-grid">
            {filteredSubmissions.map((submission) => (
              <div
                key={submission.submission_uuid}
                className="submission-grid-item cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/submissions/${submission.submission_uuid}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    router.push(`/submissions/${submission.submission_uuid}`)
                  }
                }}
              >
                <Card className="h-full cursor-pointer overflow-hidden border-border/70 bg-card/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_24px_52px_-34px_rgba(0,0,0,0.85)]">
                  <CardContent className="flex h-full min-h-0 gap-4 p-4">
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                      <ScoreVideoPreview submissionUuid={submission.submission_uuid} />
                    </div>

                    <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                      <div className="w-full flex items-center justify-between gap-2">
                        <h3 className="text-xl font-bold leading-tight xl:text-2xl">
                          {submission.trial_name} {formatTime(submission.time)}
                        </h3>
                      </div>

                      <div className="w-full flex flex-col gap-1.5 text-base">
                        <Link
                          href={`/players/${submission.player_uuid}`}
                          className="text-muted-foreground truncate underline underline-offset-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {formatPlayerNameWithScore(
                            submission.player_name,
                            submission.player_score
                          )}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(submission.date)}
                        </p>
                      </div>

                      <Badges badges={["wr", "approved"]} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  )
}
