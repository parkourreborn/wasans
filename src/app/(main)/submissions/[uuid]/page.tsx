"use client"

import { useEffect, useState } from "react"
import Badges from "@/components/custom/badges"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
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
  deny_reason?: string | null
}

type SubmissionResponse = {
  results: SubmissionValue[]
}

type AuthUser = {
  uuid: string
  permission: number
}

type AuthResponse = {
  user: AuthUser | null
}

const submissionUuidListKey = "submission_uuids"

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

function getSubmissionUuids() {
  if (typeof window === "undefined") {
    return []
  }

  const rawValue = window.localStorage.getItem(submissionUuidListKey)

  if (!rawValue) {
    return []
  }

  try {
    const parsedValue = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
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

function SubmissionNavButton({
  direction,
  submissionUuid,
}: {
  direction: "previous" | "next"
  submissionUuid: string | null
}) {
  const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon
  const label = direction === "previous" ? "Previous submission" : "Next submission"

  if (!submissionUuid) {
    return (
      <Button type="button" variant="outline" size="icon" disabled aria-label={label}>
        <Icon />
      </Button>
    )
  }

  return (
    <Button asChild variant="outline" size="icon" aria-label={label}>
      <Link href={`/submissions/${submissionUuid}`}>
        <Icon />
      </Link>
    </Button>
  )
}

export default function Home() {
  const params = useParams<{ uuid: string }>()
  const router = useRouter()
  const uuid = params.uuid
  const [playerUuid] = useState(getPlayerUuid)
  const [submissionUuids] = useState<string[]>(getSubmissionUuids)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [submission, setSubmission] = useState<SubmissionValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [denyReason, setDenyReason] = useState("")
  const [denyDialogOpen, setDenyDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubmission = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/submissions/${uuid}`)
        const json: unknown = await response.json().catch(() => null)

        if (!response.ok) {
          setError("Unable to load submission data.")
          return
        }

        const responseData = json as SubmissionResponse
        setSubmission(responseData.results?.[0] ?? null)
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
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: playerUuid
            ? {
                "x-wasans-player-uuid": playerUuid,
              }
            : undefined,
        })
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setAuthUser(json.user)
          if (json.user?.uuid) {
            window.localStorage.setItem("player_uuid", json.user.uuid)
          }
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

  const updateState = async (state: string, reason?: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/submissions/${uuid}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(authHeaders || {}),
        },
        body: JSON.stringify({
          state,
          ...(state === "denied" ? { deny_reason: reason } : {}),
        }),
      })
      const json = (await response.json().catch(() => null)) as SubmissionResponse & { error?: string } | null

      if (!response.ok) {
        setError(json?.error || "Unable to update submission")
        return
      }

      setSubmission(json?.results?.[0] ?? null)
      if (state === "denied") {
        setDenyDialogOpen(false)
        setDenyReason("")
      }
    } catch (err) {
      console.error(err)
      setError("Unable to update submission")
    } finally {
      setSaving(false)
    }
  }

  const openDenyDialog = () => {
    setDenyReason(submission?.deny_reason || "")
    setDenyDialogOpen(true)
  }

  const submitDenyReason = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    updateState("denied", denyReason)
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
  const storedDenyReason = submission.deny_reason?.trim()
  const rawTimeString = String(rawTimeValue)
  const time = formatTime(rawTimeString)
  const formattedDate = formatDate(date)
  const badges = [
    state === "approved" ? "approved" : state === "denied" ? "denied" : "pending",
  ]
  const videoSrc = `https://assets.wasans.tully.sh/scores/${uuid}.mp4`
  const canDelete = authUser?.uuid === submission.player_uuid || (authUser?.permission ?? 0) >= 1
  const canModerate = (authUser?.permission ?? 0) >= 1
  const currentSubmissionIndex = submissionUuids.findIndex((item) => item === uuid)
  const previousSubmissionUuid =
    currentSubmissionIndex > 0 ? submissionUuids[currentSubmissionIndex - 1] : null
  const nextSubmissionUuid =
    currentSubmissionIndex >= 0 && currentSubmissionIndex < submissionUuids.length - 1
      ? submissionUuids[currentSubmissionIndex + 1]
      : null

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-4">
            <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-3">
              <SubmissionNavButton direction="previous" submissionUuid={previousSubmissionUuid} />

              <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                <h2 className="text-2xl font-bold lg:text-3xl">{trial_name} {time}</h2>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href={`/players/${submission.player_uuid}`}
                    className="lg:text-lg text-muted-foreground underline underline-offset-4"
                  >
                    {formatPlayerNameWithScore(player_name, submission.player_score)}
                  </Link>
                  <Separator orientation="vertical" className="hidden h-5 sm:block" />
                  <p className="text-muted-foreground">{formattedDate}</p>
                </div>
                <div className="flex justify-center">
                  <Badges badges={badges} />
                </div>
                {state === "denied" && storedDenyReason && (
                  <p className="max-w-2xl text-sm text-destructive">
                    Denied: {storedDenyReason}
                  </p>
                )}
              </div>

              <SubmissionNavButton direction="next" submissionUuid={nextSubmissionUuid} />
            </div>

            {(canModerate || canDelete) && (
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                {canModerate && (
                  <div className="flex flex-col justify-center gap-2 sm:flex-row">
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
                      onClick={openDenyDialog}
                    >
                      <XIcon />
                      Denied
                    </Button>
                    <AlertDialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deny submission?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Add the reason this submission is being denied.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Textarea
                          value={denyReason}
                          onChange={(event) => setDenyReason(event.target.value)}
                          placeholder="Reason"
                          maxLength={500}
                          className="min-h-28"
                          disabled={saving}
                        />
                        <div className="text-right text-xs text-muted-foreground">
                          {denyReason.trim().length}/500
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={saving || denyReason.trim().length === 0}
                            onClick={submitDenyReason}
                          >
                            Deny
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
