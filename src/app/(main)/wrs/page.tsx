"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Badges from "@/components/custom/badges"
import { ScoreVideoPreview } from "@/components/custom/score-video-preview"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

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
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return submissions
    }

    return submissions.filter((submission) =>
      submission.trial_name.toLowerCase().includes(normalizedQuery)
    )
  }, [searchQuery, submissions])

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const response = await fetch(`/api/wrs`,{ cache: "force-cache"})
        if (!response.ok) {
          setError("Failed to load submissions")
          return
        }

        const json = (await response.json()) as SubmissionsResponse
        setSubmissions(json.results || [])
      } catch (err) {
        setError("Error loading submissions")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchSubmissions()
  }, [])

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

  if (submissions.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">No submissions yet</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <Input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search by trial name"
        aria-label="Search world records by trial name"
        className="h-10"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredSubmissions.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">No matching world records</p>
          </div>
        ) : (
          <div className="submissions-grid">
            {filteredSubmissions.map((submission) => (
              <Link
                key={submission.trial_name}
                href={`/submissions/${submission.submission_uuid}`}
                className="submission-grid-item"
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer overflow-hidden">
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

                      <Badges badges={["wr", "approved"]} />
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
