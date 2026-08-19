"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { HistoryIcon } from "lucide-react"
import { apiV1 } from "@/lib/api"
import { trials } from "@/lib/trials"
import { SubmissionCard } from "@/components/custom/submission-card"
import { PageShell, SubmissionList } from "@/components/custom/page-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

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

type HistoryResponse = {
  results: HistoryRow[]
}

type CachedHistory = {
  results: Submission[]
  timestamp: number
}

const HISTORY_CACHE_KEY = "wasans_wr_history_cache_v2"
const submissionUuidListKey = "submission_uuids"

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

function loadCachedHistory() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedHistory
    return Array.isArray(parsed?.results) ? parsed.results : null
  } catch {
    return null
  }
}

function storeCachedHistory(results: Submission[]) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(
      HISTORY_CACHE_KEY,
      JSON.stringify({ results, timestamp: Date.now() })
    )
  } catch {
    // The history can outgrow the storage quota; caching is best effort.
  }
}

export default function WorldRecordHistoryPage() {
  const router = useRouter()
  const [records, setRecords] = useState<Submission[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return records
    }

    return records.filter((record) =>
      record.trial_name.toLowerCase().includes(normalizedQuery)
      || record.player_name.toLowerCase().includes(normalizedQuery)
    )
  }, [searchQuery, records])

  useEffect(() => {
    if (typeof window === "undefined" || loading) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(filteredRecords.map((record) => record.submission_uuid))
    )
  }, [filteredRecords, loading])

  useEffect(() => {
    // Trials are fetched in their canonical order so the flattened list stays
    // grouped by trial, with each trial's past records newest first.
    const fetchHistory = async (cachedResults: Submission[] | null) => {
      const entries = await Promise.all(
        trials.map(async (trial) => {
          try {
            const response = await fetch(apiV1(`/records/world/history/${encodeURIComponent(trial)}`), {
              cache: "no-cache",
            })

            if (!response.ok) {
              return null
            }

            const json = (await response.json()) as HistoryResponse
            // The endpoint returns the record chain oldest first, so after
            // reversing the first entry is the record that still stands. That
            // one lives on the World Records page, so drop it here.
            return (json.results || []).map(toSubmission).reverse().slice(1)
          } catch (err) {
            console.error(err)
            return null
          }
        })
      )

      if (entries.every((entry) => entry === null)) {
        if (!cachedResults) {
          setError("Failed to load world record history")
        }
        return
      }

      const results = entries.flatMap((entry) => entry || [])
      setRecords(results)
      storeCachedHistory(results)
    }

    const load = async () => {
      const cachedResults = loadCachedHistory()

      if (cachedResults?.length) {
        setRecords(cachedResults)
        setLoading(false)
      }

      try {
        await fetchHistory(cachedResults)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <PageShell>
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
          Unable to load the record history right now.
          <div className="mt-2">{error}</div>
        </div>
      </PageShell>
    )
  }

  if (records.length === 0) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-border/60 bg-background/55 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          No world record has been beaten yet. A trial shows up here once its record changes hands.
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="sticky top-14 z-30 rounded-3xl border border-border/60 bg-background/80 p-4 backdrop-blur-xl md:top-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-(--page-accent)" />
              <h1 className="text-sm font-semibold tracking-tight">World Record History</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredRecords.length} of {records.length} past records
            </p>
          </div>

          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by trial or player name"
            aria-label="Search past world records by trial or player name"
            className="h-10 w-full min-w-0"
          />
        </div>
      </div>

      <SubmissionList className="submissions-grid">
        {filteredRecords.length === 0 ? (
          <div className="flex min-h-48 w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 backdrop-blur-xl">
            <p className="text-muted-foreground">No matching past world records</p>
          </div>
        ) : (
          filteredRecords.map((record) => (
            <SubmissionCard
              key={record.submission_uuid}
              submissionUuid={record.submission_uuid}
              trialName={record.trial_name}
              timeText={formatTime(record.time)}
              playerUuid={record.player_uuid}
              playerName={record.player_name}
              playerScore={record.player_score}
              playerId={record.player_id}
              playerDiscordAvatar={record.discord_avatar}
              playerDiscordDiscriminator={record.discord_discriminator}
              dateText={formatDate(record.date)}
              state="approved"
              moderatorNote={record.moderator_note}
              moderatorUsername={record.moderator_username}
              className="h-full cursor-pointer overflow-hidden border-border/60 bg-background/55 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_24px_52px_-34px_rgba(0,0,0,0.85)]"
              onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
            />
          ))
        )}
      </SubmissionList>
    </PageShell>
  )
}
