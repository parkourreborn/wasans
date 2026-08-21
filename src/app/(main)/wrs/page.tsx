"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { apiV2 } from "@/lib/api"
import { trials } from "@/lib/trials"
import { useApiGet } from "@/hooks/use-api"
import { SubmissionCard } from "@/components/custom/submission-card"
import { ErrorState, PageHeader, PageShell, SubmissionList } from "@/components/custom/page-shell"
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

type WorldRecordsResponse = {
  data: Submission[]
}

const submissionUuidListKey = "submission_uuids"
const trialOrderByName = new Map(trials.map((trial, index) => [trial.toUpperCase(), index]))

function compareByTrialOrder(aTrialName: string, bTrialName: string) {
  const aOrder = trialOrderByName.get(String(aTrialName).toUpperCase())
  const bOrder = trialOrderByName.get(String(bTrialName).toUpperCase())

  if (aOrder == null && bOrder == null) {
    return aTrialName.localeCompare(bTrialName)
  }
  if (aOrder == null) return 1
  if (bOrder == null) return -1
  return aOrder - bOrder
}

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

export default function WorldRecordsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const { data, loading, error } = useApiGet<WorldRecordsResponse>(apiV2("/records/world"))
  const submissions = data?.data ?? []

  const wrIds = useMemo(() => new Set(submissions.map((submission) => submission.submission_uuid)), [submissions])

  const orderedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => compareByTrialOrder(a.trial_name, b.trial_name)),
    [submissions]
  )

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return orderedSubmissions
    }
    return orderedSubmissions.filter((submission) => submission.trial_name.toLowerCase().includes(normalizedQuery))
  }, [searchQuery, orderedSubmissions])

  useEffect(() => {
    if (typeof window === "undefined" || loading) {
      return
    }
    window.localStorage.setItem(submissionUuidListKey, JSON.stringify(filteredSubmissions.map((s) => s.submission_uuid)))
  }, [filteredSubmissions, loading])

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="World Records" />
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
        <PageHeader title="World Records" />
        <ErrorState message={error} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="World Records" />

      <div className="sticky top-14 z-30 rounded-lg border border-border bg-background p-4 md:top-0">
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by trial name"
          aria-label="Search world records by trial name"
          className="h-10 w-full min-w-0"
        />
      </div>

      <SubmissionList className="submissions-grid">
        {filteredSubmissions.length === 0 ? (
          <div className="flex min-h-48 w-full items-center justify-center rounded-lg border border-dashed border-border">
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
              onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
            />
          ))
        )}
      </SubmissionList>
    </PageShell>
  )
}
