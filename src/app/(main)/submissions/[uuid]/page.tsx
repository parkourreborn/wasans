"use client"

import { useEffect, useState, type MouseEvent } from "react"
import Badges from "@/components/custom/badges"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { apiV1 } from "@/lib/api"
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
  moderator_note?: string | null
  moderator_username?: string | null
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
  const [submissionUuids] = useState<string[]>(getSubmissionUuids)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [submission, setSubmission] = useState<SubmissionValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [moderatorNote, setModeratorNote] = useState("")
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [denyDialogOpen, setDenyDialogOpen] = useState(false)
  const [editTimeDialogOpen, setEditTimeDialogOpen] = useState(false)
  const [editTimeValue, setEditTimeValue] = useState("")
  const [editTimeError, setEditTimeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubmission = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(apiV1(`/submissions/${uuid}`))
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
        const response = await fetch(apiV1("/auth/me"))
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setAuthUser(json.user)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchUser()
  }, [])

  const authHeaders = undefined

  const updateState = async (state: string, reason?: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV1(`/submissions/${uuid}`), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(authHeaders || {}),
        },
        body: JSON.stringify({
          state,
          ...(state === "denied" && reason ? { moderator_note: reason } : {}),
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
        setModeratorNote("")
      }
    } catch (err) {
      console.error(err)
      setError("Unable to update submission")
    } finally {
      setSaving(false)
    }
  }

  const updateModeratorNote = async (note: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV1(`/submissions/${uuid}`), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(authHeaders || {}),
        },
        body: JSON.stringify({
          moderator_note: note,
        }),
      })
      const json = (await response.json().catch(() => null)) as SubmissionResponse & { error?: string } | null

      if (!response.ok) {
        setError(json?.error || "Unable to update submission")
        return
      }

      setSubmission(json?.results?.[0] ?? null)
      setNoteDialogOpen(false)
      setModeratorNote("")
    } catch (err) {
      console.error(err)
      setError("Unable to update submission")
    } finally {
      setSaving(false)
    }
  }

  const openDenyDialog = () => {
    setModeratorNote(submission?.moderator_note || "")
    setDenyDialogOpen(true)
  }

  const openNoteDialog = () => {
    setModeratorNote(submission?.moderator_note || "")
    setNoteDialogOpen(true)
  }

  const openEditTimeDialog = () => {
    setEditTimeValue(String(submission?.time ?? ""))
    setEditTimeError(null)
    setEditTimeDialogOpen(true)
  }

  const submitDenyReason = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    updateState("denied", moderatorNote)
  }

  const submitModeratorNote = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    updateModeratorNote(moderatorNote)
  }

  const submitEditTime = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!submission) {
      return
    }

    const value = editTimeValue.trim()
    if (!/^[0-9]+(\.[0-9]{1,3})?$/.test(value) || Number(value) <= 0) {
      setEditTimeError("Enter a valid positive time with up to three decimals.")
      return
    }

    setSaving(true)
    setError(null)
    setEditTimeError(null)

    try {
      const response = await fetch(apiV1(`/submissions/${uuid}`), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(authHeaders || {}),
        },
        body: JSON.stringify({ time: value }),
      })

      const json = (await response.json().catch(() => null)) as
        | SubmissionResponse & { error?: string }
        | null

      if (!response.ok) {
        const message = json?.error || "Unable to update submission time"
        setEditTimeError(message)
        return
      }

      setSubmission(json?.results?.[0] ?? submission)
      setEditTimeDialogOpen(false)
    } catch (err) {
      console.error(err)
      setEditTimeError("Unable to update submission time")
    } finally {
      setSaving(false)
    }
  }

  const deleteSubmission = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV1(`/submissions/${uuid}`), {
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

  const { player_name, trial_name, date, time: rawTimeValue, state, moderator_username } = submission
  const storedModeratorNote = submission.moderator_note?.trim()
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
                  {moderator_username && (
                    <>
                      <Separator orientation="vertical" className="hidden h-5 sm:block" />
                      <p className="text-muted-foreground">Moderated by {moderator_username}</p>
                    </>
                  )}
                </div>
                <div className="flex justify-center">
                  <Badges badges={badges} />
                </div>
                {storedModeratorNote && (
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Moderator Note: {storedModeratorNote}
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={openNoteDialog}
                    >
                      Add note
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={openEditTimeDialog}
                    >
                      Edit time
                    </Button>
                    <AlertDialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deny submission?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Add a note explaining why this submission is being denied.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Textarea
                          value={moderatorNote}
                          onChange={(event) => setModeratorNote(event.target.value)}
                          placeholder="Reason for denial"
                          maxLength={500}
                          className="min-h-28"
                          disabled={saving}
                        />
                        <div className="text-right text-xs text-muted-foreground">
                          {moderatorNote.trim().length}/500
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={saving || moderatorNote.trim().length === 0}
                            onClick={submitDenyReason}
                          >
                            Deny
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Add moderator note</AlertDialogTitle>
                          <AlertDialogDescription>
                            Add or update a note for this submission.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Textarea
                          value={moderatorNote}
                          onChange={(event) => setModeratorNote(event.target.value)}
                          placeholder="Moderator note"
                          maxLength={500}
                          className="min-h-28"
                          disabled={saving}
                        />
                        <div className="text-right text-xs text-muted-foreground">
                          {moderatorNote.trim().length}/500
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={saving}
                            onClick={submitModeratorNote}
                          >
                            Save note
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {editTimeDialogOpen && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 px-4"
                        role="dialog"
                        aria-modal="true"
                        onClick={() => setEditTimeDialogOpen(false)}
                      >
                        <div
                          className="w-full max-w-lg rounded-3xl border border-border bg-background p-6 shadow-2xl"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-semibold">Edit submission time</h3>
                              <p className="text-sm text-muted-foreground">
                                Update the recorded time for this submission.
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setEditTimeDialogOpen(false)}>
                              <XIcon />
                            </Button>
                          </div>

                          <div className="mt-5 space-y-4">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                                Time
                              </label>
                              <Input
                                value={editTimeValue}
                                onChange={(event) => setEditTimeValue(event.target.value)}
                                placeholder="12.345"
                                className="w-full"
                                disabled={saving}
                              />
                            </div>
                            {editTimeError && (
                              <p className="text-sm text-destructive">{editTimeError}</p>
                            )}
                          </div>

                          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <Button variant="outline" disabled={saving} onClick={() => setEditTimeDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button disabled={saving} onClick={submitEditTime}>
                              Save time
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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
