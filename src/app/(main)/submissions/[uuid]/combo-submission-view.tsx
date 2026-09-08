"use client"

import { useEffect, useState, type MouseEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Badges from "@/components/custom/badges"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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
  ExternalLinkIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { apiV2 } from "@/lib/api"
import { getYoutubeEmbedId } from "@/lib/youtube"

export type ComboSubmissionValue = {
  uuid: string
  player_uuid: string
  category_slug: string
  player_name: string
  combo_count: number
  youtube_url: string
  date: number
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
  player_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
}

type ComboSubmissionResponse = {
  data?: { results: ComboSubmissionValue[] }
  error?: { message?: string }
}

type ComboCategory = { slug: string; label: string }
type ComboCategoriesResponse = { data?: ComboCategory[] }

type AuthUser = {
  uuid: string
  permission: number
}

type AuthResponse = {
  data?: { user: AuthUser | null }
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

function formatDate(unixTime: number) {
  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const year = date.getFullYear()
  return `${month}-${day}-${year}`
}

function ComboSubmissionNavButton({
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

export default function ComboSubmissionView({
  uuid,
  initialSubmission,
}: {
  uuid: string
  initialSubmission: ComboSubmissionValue
}) {
  const router = useRouter()
  const [submissionUuids, setSubmissionUuids] = useState<string[]>([])
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [submission, setSubmission] = useState<ComboSubmissionValue | null>(initialSubmission)
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [moderatorNote, setModeratorNote] = useState("")
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [denyDialogOpen, setDenyDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSubmissionUuids(getSubmissionUuids())
  }, [uuid])

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const categoriesResponse = await fetch(apiV2("/combo-categories"), { cache: "force-cache" })

        if (categoriesResponse.ok) {
          const categoriesJson = (await categoriesResponse.json().catch(() => null)) as ComboCategoriesResponse | null
          setCategoryLabels(
            Object.fromEntries((categoriesJson?.data || []).map((category) => [category.slug, category.label]))
          )
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchCategories()
  }, [uuid])

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(apiV2("/auth/me"))
        const json = (await response.json()) as AuthResponse

        if (response.ok) {
          setAuthUser(json.data?.user ?? null)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchUser()
  }, [])

  const updateState = async (state: string, reason?: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV2(`/combo-submissions/${uuid}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state,
          ...(state === "denied" && reason ? { moderator_note: reason } : {}),
        }),
      })
      const json = (await response.json().catch(() => null)) as ComboSubmissionResponse | null

      if (!response.ok) {
        setError(json?.error?.message || "Unable to update combo submission")
        return
      }

      setSubmission(json?.data?.results?.[0] ?? null)
      if (state === "denied") {
        setDenyDialogOpen(false)
        setModeratorNote("")
      }
    } catch (err) {
      console.error(err)
      setError("Unable to update combo submission")
    } finally {
      setSaving(false)
    }
  }

  const updateModeratorNote = async (note: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV2(`/combo-submissions/${uuid}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moderator_note: note }),
      })
      const json = (await response.json().catch(() => null)) as ComboSubmissionResponse | null

      if (!response.ok) {
        setError(json?.error?.message || "Unable to update combo submission")
        return
      }

      setSubmission(json?.data?.results?.[0] ?? null)
      setNoteDialogOpen(false)
      setModeratorNote("")
    } catch (err) {
      console.error(err)
      setError("Unable to update combo submission")
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

  const submitDenyReason = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    updateState("denied", moderatorNote)
  }

  const submitModeratorNote = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    updateModeratorNote(moderatorNote)
  }

  const deleteSubmission = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(apiV2(`/combo-submissions/${uuid}`), { method: "DELETE" })
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setError(json?.error?.message || "Unable to delete combo submission")
        return
      }

      router.push("/submissions/combos")
      router.refresh()
    } catch (err) {
      console.error(err)
      setError("Unable to delete combo submission")
    } finally {
      setSaving(false)
    }
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
            <p className="text-muted-foreground text-center">No combo submission found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { player_name, category_slug, date, combo_count, state, moderator_username } = submission
  const categoryLabel = categoryLabels[category_slug] || category_slug
  const embedId = getYoutubeEmbedId(submission.youtube_url)
  const formattedDate = formatDate(date)
  const badges = [state === "approved" ? "approved" : state === "denied" ? "denied" : "pending"]
  const storedModeratorNote = submission.moderator_note?.trim()
  const canDelete = authUser?.uuid === submission.player_uuid || (authUser?.permission ?? 0) >= 1
  const canModerate = (authUser?.permission ?? 0) >= 1
  const currentSubmissionIndex = submissionUuids.findIndex((item) => item === uuid)
  const canNavigate = currentSubmissionIndex >= 0 && submissionUuids.length > 1
  const previousSubmissionUuid =
    canNavigate && currentSubmissionIndex > 0 ? submissionUuids[currentSubmissionIndex - 1] : null
  const nextSubmissionUuid =
    canNavigate && currentSubmissionIndex < submissionUuids.length - 1
      ? submissionUuids[currentSubmissionIndex + 1]
      : null

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-4">
            <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-3">
              <ComboSubmissionNavButton direction="previous" submissionUuid={previousSubmissionUuid} />

              <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <h2 className="text-2xl font-bold lg:text-3xl">
                    {categoryLabel} {combo_count}
                  </h2>
                  <Badges badges={badges} />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href={`/players/${submission.player_uuid}`}
                    className="lg:text-lg text-muted-foreground underline underline-offset-4"
                  >
                    {player_name}
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
                {storedModeratorNote && (
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Moderator Note: {storedModeratorNote}
                  </p>
                )}
              </div>

              <ComboSubmissionNavButton direction="next" submissionUuid={nextSubmissionUuid} />
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
                    <Button type="button" variant="outline" disabled={saving} onClick={openNoteDialog}>
                      Add note
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
                          <AlertDialogAction disabled={saving} onClick={submitModeratorNote}>
                            Save note
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
                        <AlertDialogTitle>Delete combo submission?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the submission. This cannot be undone.
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
          {embedId ? (
            <div className="flex w-full flex-col items-center gap-3">
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
                <iframe
                  src={`https://www.youtube.com/embed/${embedId}`}
                  title={`${player_name}'s ${categoryLabel} combo submission`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={submission.youtube_url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Open on YouTube
                </a>
              </Button>
            </div>
          ) : (
            <div className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8">
              <p className="text-sm text-muted-foreground">Proof video is hosted on YouTube, not on this site.</p>
              <Button asChild>
                <a href={submission.youtube_url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Watch on YouTube
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
