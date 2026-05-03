"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Badges from "@/components/custom/badges"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type Submission = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const response = await fetch("https://wasans.tully.sh/api/submissions")
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
        <p className="text-muted-foreground">Loading submissions...</p>
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
    <div className="w-full flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {submissions.map((submission) => (
          <Link key={submission.uuid} href={`/submissions/${submission.uuid}`}>
            <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="w-full flex flex-col gap-4">
                  {/* Video preview */}
                  <div className="w-full aspect-video bg-muted rounded-lg overflow-hidden">
                    <video
                      src={`https://assets.wasans.tully.sh/scores/${submission.uuid}.mp4`}
                      className="w-full h-full object-cover"
                      controls={false}
                    />
                  </div>

                  {/* Submission info */}
                  <div className="w-full flex flex-col gap-2">
                    <div className="w-full flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold">
                        {submission.trial_name} {formatTime(submission.time)}
                      </h3>
                    </div>

                    <div className="w-full flex flex-col gap-1 text-sm">
                      <p className="text-muted-foreground">{submission.player_name}</p>
                      <p className="text-xs text-muted-foreground">
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
                      ]}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
