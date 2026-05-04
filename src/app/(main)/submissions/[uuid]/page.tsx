"use client"

import { useEffect, useState } from "react"
import Badges from "@/components/custom/badges"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  CheckIcon,
  ClockIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"

type SubmissionValue = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  player_score: number
  time: number | string
  date: string
  state: string
}

type SubmissionResponse = {
  results: SubmissionValue[]
}

type WorldRecordResponse = {
  results: {
    submission_uuid: string
  }[]
}

type AuthUser = {
  uuid: string
  permission: number
}

type AuthResponse = {
  user: AuthUser | null
}

function getPlayerUuid() {
  if (typeof window === "undefined") {
    return ""
  }

  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get("player") || params.get("player_uuid") || params.get("uuid")

  if (fromUrl) {
    window.localStorage.setItem("player_uuid", fromUrl)
    return fromUrl
  }

  return window.localStorage.getItem("player_uuid") || ""
}

function formatTime(rawTime: string) {
  const match = rawTime.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return rawTime
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

export default function Home() {
  const params = useParams<{ uuid: string }>()
  const router = useRouter()
  const uuid = params.uuid
  const [playerUuid] = useState(getPlayerUuid)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [submission, setSubmission] = useState<SubmissionValue | null>(null)
  const [isWorldRecord, setIsWorldRecord] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const [response, wrResponse] = await Promise.all([
          fetch(`/api/submissions/${uuid}`),
          fetch(`/api/wrs`),
        ])
        const json: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          setError("Unable to load submission data.")
          return
        }

        const responseData = json as SubmissionResponse
        setSubmission(responseData.results?.[0] ?? null)

        if (wrResponse.ok) {
          const wrJson = (await wrResponse.json()) as WorldRecordResponse
          setIsWorldRecord((wrJson.results || []).some((wr) => wr.submission_uuid === uuid))
        }
      } catch (err) {
        setError("Unable to load submission data.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchSubmission()
  }, [uuid])

  useEffect(() => {
    if (!playerUuid) {
      return
    }

    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: {
            "x-wasans-player-uuid": playerUuid,
          },
        })
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setAuthUser(json.user)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchUser()
  }, [playerUuid])

  const authHeaders = playerUuid
    ? {
        "x-wasans-player-uuid": playerUuid,
      }
    : undefined

  const updateState = async (state: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/submissions/${uuid}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(authHeaders || {}),
        },
        body: JSON.stringify({ state }),
      })
      const json = (await response.json().catch(() => null)) as SubmissionResponse & { error?: string } | null

      if (!response.ok) {
        setError(json?.error || "Unable to update submission")
        return
      }

      setSubmission(json?.results?.[0] ?? null)
    } catch (err) {
      console.error(err)
      setError("Unable to update submission")
    } finally {
      setSaving(false)
    }
  }

  const deleteSubmission = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/submissions/${uuid}`, {
        method: "DELETE",
        headers: authHeaders,
      })
      const json = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setError(json?.error || "Unable to delete submission")
        return
      }

      router.push("/submissions")
      router.refresh()
    } catch (err) {
      console.error(err)
      setError("Unable to delete submission")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4">
        <Card className="w-full">
          <CardContent>
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!submission) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4">
        <Card className="w-full">
          <CardContent>
            <p className="text-muted-foreground text-center">No submission found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { player_name, trial_name, date, time: rawTimeValue, state } = submission
  const rawTimeString = String(rawTimeValue)
  const time = formatTime(rawTimeString)
  const formattedDate = formatDate(date)
  const badges = [
    state === "approved" ? "approved" : state === "denied" ? "denied" : "pending",
    isWorldRecord ? "wr" : "",
  ]
  const videoSrc = `https://assets.wasans.tully.sh/scores/${uuid}.mp4`
  const canDelete = authUser?.uuid === submission.player_uuid || (authUser?.permission ?? 0) >= 1
  const canModerate = (authUser?.permission ?? 0) >= 1

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-2">
            <div className="w-full flex items-center justify-between">
              <div className="w-full flex items-center justify-start gap-4">
                <h2 className="lg:text-3xl font-bold">{trial_name} {time}</h2>
                <Separator orientation="vertical" />
                <p className="lg:text-lg text-muted-foreground">
                  {formatPlayerNameWithScore(player_name, submission.player_score)}
                </p>
                <Separator orientation="vertical" />
                <p className="text-muted-foreground">{formattedDate}</p>
              </div>
            </div>

            <Badges badges={badges} />

            {(canModerate || canDelete) && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {canModerate && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant={state === "pending" ? "default" : "outline"}
                      disabled={saving}
                      onClick={() => updateState("pending")}
                    >
                      <ClockIcon />
                      Pending
                    </Button>
                    <Button
                      type="button"
                      variant={state === "approved" ? "default" : "outline"}
                      disabled={saving}
                      onClick={() => updateState("approved")}
                    >
                      <CheckIcon />
                      Accepted
                    </Button>
                    <Button
                      type="button"
                      variant={state === "denied" ? "destructive" : "outline"}
                      disabled={saving}
                      onClick={() => updateState("denied")}
                    >
                      <XIcon />
                      Denied
                    </Button>
                  </div>
                )}

                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={saving}>
                        <Trash2Icon />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the submission and its stored score video. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={deleteSubmission}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <video controls className="w-full" src={videoSrc} />
        </CardContent>
      </Card>
    </div>
  )
}
