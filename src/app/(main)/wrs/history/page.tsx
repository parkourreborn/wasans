"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { HistoryIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { trials } from "@/lib/trials"
import { SubmissionCard } from "@/components/custom/submission-card"
import { ErrorState, PageShell, SubmissionList } from "@/components/custom/page-shell"
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
  date: number
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
}

type HistoryRow = Omit<Submission, "submission_uuid"> & { uuid: string }
type HistoryResponse = { data: HistoryRow[] }

const submissionUuidListKey = "submission_uuids"

function formatTime(rawTime: number | string) {
  const timeStr = String(rawTime)
  const match = timeStr.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return timeStr
  }
  const [, seconds, ms] = match
  return `${String(Number(seconds))}.${ms.padEnd(3, "0")}`
}

function formatDate(unixTime: number) {
  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}-${date.getFullYear()}`
}

function toSubmission({ uuid, ...rest }: HistoryRow): Submission {
  return { ...rest, submission_uuid: uuid }
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
    return records.filter(
      (record) =>
        record.trial_name.toLowerCase().includes(normalizedQuery)
        || record.player_name.toLowerCase().includes(normalizedQuery)
    )
  }, [searchQuery, records])

  useEffect(() => {
    if (typeof window === "undefined" || loading) {
      return
    }
    window.localStorage.setItem(submissionUuidListKey, JSON.stringify(filteredRecords.map((r) => r.submission_uuid)))
  }, [filteredRecords, loading])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(apiV2("/records/world/history"), { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Failed to load world record history")
        }

        const json = (await response.json()) as HistoryResponse
        const rows = (json.data || []).map(toSubmission)

        // The endpoint returns every trial's chain in one query, oldest
        // first per trial. Group by trial (in canonical trial order so the
        // flattened list stays grouped the way the page expects), then per
        // trial drop the newest entry (the record that still stands — that
        // one lives on the World Records page) and show the rest newest
        // first.
        const byTrial = new Map<string, Submission[]>()
        for (const row of rows) {
          const existing = byTrial.get(row.trial_name) ?? []
          existing.push(row)
          byTrial.set(row.trial_name, existing)
        }

        const ordered = trials.flatMap((trial) => {
          const trialRows = byTrial.get(trial)
          return trialRows ? [...trialRows].reverse().slice(1) : []
        })

        setRecords(ordered)
      } catch (err) {
        console.error(err)
        setError("Failed to load world record history")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <PageShell>
        <div className="rounded-lg border border-border p-4">
          <Skeleton className="h-10 w-full md:w-72" />
        </div>
        <SubmissionList className="submissions-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="submission-grid-item">
              <Card className="h-full overflow-hidden">
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
        <ErrorState title="World Record History" message={error} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="sticky top-14 z-30 rounded-lg border border-border bg-background p-4 md:top-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-primary" />
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
          <div className="flex min-h-48 w-full items-center justify-center rounded-lg border border-dashed border-border">
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
              onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
            />
          ))
        )}
      </SubmissionList>
    </PageShell>
  )
}
