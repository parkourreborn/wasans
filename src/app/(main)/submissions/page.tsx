"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Badges from "@/components/custom/badges"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LogInIcon, PlusCircleIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

type Submission = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  player_score: number
  time: number
  date: string
  state: string
}

type WorldRecord = {
  submission_uuid: string
}

type SubmissionsResponse = {
  results: Submission[]
}

type WorldRecordsResponse = {
  results: WorldRecord[]
}

type AuthResponse = {
  user?: {
    uuid: string
    player_name: string
    score: number
    permission: number
  }
  error?: string
  needs_player_name?: boolean
}

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

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [wrSubmissionIds, setWrSubmissionIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [authLabel, setAuthLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return submissions.filter((submission) => {
      const matchesStatus = statusFilter === "all" || submission.state === statusFilter
      const matchesSearch =
        !normalizedQuery || submission.trial_name.toLowerCase().includes(normalizedQuery)

      return matchesStatus && matchesSearch
    })
  }, [searchQuery, statusFilter, submissions])

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const [submissionsResponse, wrsResponse, authResponse] = await Promise.all([
          fetch(`/api/submissions`),
          fetch(`/api/wrs`),
          fetch(`/api/auth/me`),
        ])

        if (!submissionsResponse.ok) {
          setError("Failed to load submissions")
          return
        }
        
        const submissionsJson = (await submissionsResponse.json()) as SubmissionsResponse
        setSubmissions(submissionsJson.results || [])

        if (wrsResponse.ok) {
          const wrsJson = (await wrsResponse.json()) as WorldRecordsResponse
          setWrSubmissionIds(new Set((wrsJson.results || []).map((wr) => wr.submission_uuid)))
        }

        if (authResponse.ok) {
          const authJson = (await authResponse.json()) as AuthResponse

          if (authJson.user) {
            window.localStorage.setItem("player_uuid", authJson.user.uuid)
            setAuthLabel(
              `${formatPlayerNameWithScore(authJson.user.player_name, authJson.user.score)}${
                authJson.user.permission >= 1 ? " (admin)" : ""
              }`
            )
          }
        }

        const authError = new URLSearchParams(window.location.search).get("auth_error")

        if (authError) {
          setError(authError)
        }
      } catch (err) {
        setError("Error loading submissions")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchSubmissions()
  }, [])

  useEffect(() => {
    if (loading) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(filteredSubmissions.map((submission) => submission.uuid))
    )
  }, [filteredSubmissions, loading])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by trial name"
          aria-label="Search submissions by trial name"
          className="h-10 flex-1"
        />
        <NativeSelect
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-full lg:w-40"
          aria-label="Filter submissions by status"
        >
          <NativeSelectOption value="all">All</NativeSelectOption>
          <NativeSelectOption value="pending">Pending</NativeSelectOption>
          <NativeSelectOption value="approved">Approved</NativeSelectOption>
          <NativeSelectOption value="denied">Denied</NativeSelectOption>
        </NativeSelect>
        <Link href="/submissions/new">
          <Button variant="outline" className="h-10 w-10 cursor-pointer"><PlusCircleIcon /></Button>
        </Link>
      </div>

      {authLabel && <p className="text-sm text-muted-foreground">Logged in as {authLabel}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredSubmissions.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">
              {submissions.length === 0 ? "No submissions yet" : "No matching submissions"}
            </p>
          </div>
        ) : (
          <div className="submissions-grid">
            {filteredSubmissions.map((submission) => (
              <Link
                key={submission.uuid}
                href={`/submissions/${submission.uuid}`}
                className="submission-grid-item"
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer overflow-hidden">
                  <CardContent className="flex h-full min-h-0 gap-4 p-4">
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                      <div className="aspect-video max-h-full w-full bg-muted rounded-lg overflow-hidden">
                        <video
                          src={`https://assets.wasans.tully.sh/scores/${submission.uuid}.mp4`}
                          className="w-full h-full object-cover"
                          controls={false}
                        />
                      </div>
                    </div>

                    <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                      <div className="w-full flex items-center justify-between gap-2">
                        <h3 className="text-xl font-bold leading-tight xl:text-2xl">
                          {submission.trial_name} {formatTime(submission.time)}
                        </h3>
                      </div>

                      <div className="w-full flex flex-col gap-1.5 text-base">
                        <p className="text-muted-foreground truncate">
                          {formatPlayerNameWithScore(
                            submission.player_name,
                            submission.player_score
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(submission.date)}
                        </p>
                      </div>

                      <Badges
                        badges={[
                          submission.state === "approved"
                            ? "approved"
                            : submission.state === "denied"
                              ? "denied"
                              : "pending",
                          wrSubmissionIds.has(submission.uuid) ? "wr" : "",
                        ]}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
