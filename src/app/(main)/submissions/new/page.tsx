"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { TrialName, trials } from "@/lib/trials"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import calculateScore from "@/lib/calc-score"

type SubmissionDraft = {
  id: string
  trial_name: TrialName
  time: string
  proof_url: string
  proof_file: File | null
}

type SubmissionValue = {
  trial_name: TrialName
  time: number | string
  state?: string
}

type WorldRecordValue = {
  trial_name: TrialName
  time: number | string
}

type ListResponse<T> = {
  results?: T[]
  error?: string
}

type AuthResponse = {
  user?: {
    uuid: string
  } | null
}

type UploadState = {
  progress: number
  status: "idle" | "uploading" | "processing" | "done" | "error"
  message?: string
}

let cachedWorldRecords: Record<string, number> | null = null
let worldRecordsRequest: Promise<Record<string, number>> | null = null

function parseFilename(filename: string): { trialName?: TrialName; time?: string } {
  const result: { trialName?: TrialName; time?: string } = {}

  // Extract time in format x.xxx (e.g., 12.345)
  const timeMatch = filename.match(/(\d+(?:\.\d{1,3})?)/)
  if (timeMatch) {
    const time = timeMatch[1]
    // Validate it's a reasonable time (not too long, not zero)
    const timeNum = parseFloat(time)
    if (timeNum > 0 && timeNum < 1000) { // reasonable bounds for trial times
      result.time = time
    }
  }

  // Extract trial name (case insensitive)
  const filenameLower = filename.toLowerCase()
  for (const trial of trials) {
    if (filenameLower.includes(trial.toLowerCase())) {
      result.trialName = trial
      break
    }
  }

  return result
}

function createDraft(id = "submission-1"): SubmissionDraft {
  return {
    id,
    trial_name: trials[0],
    time: "",
    proof_url: "",
    proof_file: null,
  }
}

async function getWorldRecords() {
  if (cachedWorldRecords) {
    return cachedWorldRecords
  }

  worldRecordsRequest ??= fetch("/api/wrs", { cache: "force-cache" })
    .then(async (response) => {
      const json = (await response.json()) as ListResponse<WorldRecordValue>

      if (!response.ok) {
        throw new Error(json.error || "Unable to load world records")
      }

      cachedWorldRecords = Object.fromEntries(
        (json.results || []).map((record) => [
          record.trial_name,
          Number(record.time),
        ])
      )

      return cachedWorldRecords
    })
    .finally(() => {
      worldRecordsRequest = null
    })

  return worldRecordsRequest
}

function scoreFor(wr: number | undefined, time: string, trial: TrialName, personalBest?: number) {
  const parsedTime = time === "" ? personalBest : Number(time)

  if (!wr || !parsedTime || !Number.isFinite(parsedTime) || parsedTime <= 0) {
    return "0.000"
  }

  return calculateScore(wr, parsedTime, trial).toFixed(3)
}

function formatTime(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "")
}

function uploadSubmissions(
  submissions: SubmissionDraft[],
  onProgress: (progress: number, status: UploadState["status"]) => void
) {
  return new Promise<ListResponse<unknown>>((resolve, reject) => {
    const payload = submissions.map((submission) => ({
      trial_name: submission.trial_name,
      time: submission.time,
      proof_url: submission.proof_url.trim(),
    }))

    const formData = new FormData()
    formData.append("submissions", JSON.stringify(payload))

    submissions.forEach((submission, index) => {
      if (submission.proof_file) {
        formData.append(`proof_file_${index}`, submission.proof_file)
      }
    })

    const request = new XMLHttpRequest()

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress(50, "uploading")
        return
      }

      const progress = Math.min(Math.round((event.loaded / event.total) * 90), 90)
      onProgress(progress, "uploading")
    }

    request.upload.onload = () => {
      onProgress(90, "processing")
    }

    request.onload = () => {
      let json: ListResponse<unknown> | null = null

      try {
        json = JSON.parse(request.responseText || "null") as ListResponse<unknown> | null
      } catch {
        json = null
      }

      if (request.status >= 200 && request.status < 300) {
        onProgress(100, "done")
        resolve(json || {})
        return
      }

      reject(new Error(json?.error || "Unable to create submission"))
    }

    request.onerror = () => {
      reject(new Error("Unable to create submission"))
    }

    request.onabort = () => {
      reject(new Error("Upload was cancelled"))
    }

    onProgress(submissions.some((submission) => submission.proof_file) ? 0 : 90, "uploading")
    request.open("POST", "/api/submissions")
    request.send(formData)
  })
}

export default function NewSubmissionPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<{ uuid: string } | null>(null)
  const [personalBests, setPersonalBests] = useState<Record<string, number>>({})
  const [worldRecords, setWorldRecords] = useState<Record<string, number>>({})
  const [loadingContext, setLoadingContext] = useState(true)
  const [submissions, setSubmissions] = useState<SubmissionDraft[]>([createDraft()])
  const [submitting, setSubmitting] = useState(false)
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)

  useEffect(() => {
    const loadContext = async () => {
      try {
        const authResponse = await fetch("/api/auth/me")
        const authJson = (await authResponse.json().catch(() => null)) as AuthResponse | null
        const activePlayerUuid = authJson?.user?.uuid || ""

        if (!authResponse.ok || !activePlayerUuid) {
          setError("Sign in with Discord to create submissions.")
          return
        }

        setAuthUser(authJson?.user || null)

        const [pbResponse, wrValues] = await Promise.all([
          fetch(`/api/submissions/player/${encodeURIComponent(activePlayerUuid)}`),
          getWorldRecords(),
        ])
        const pbJson = (await pbResponse.json()) as ListResponse<SubmissionValue>

        if (!pbResponse.ok) {
          throw new Error(pbJson.error || "Unable to load current scores")
        }

        const nextPersonalBests: Record<string, number> = {}

        for (const submission of pbJson.results || []) {
          if (submission.state === "denied") {
            continue
          }

          const time = Number(submission.time)
          const currentBest = nextPersonalBests[submission.trial_name]

          if (Number.isFinite(time) && (!currentBest || time < currentBest)) {
            nextPersonalBests[submission.trial_name] = time
          }
        }

        setPersonalBests(nextPersonalBests)
        setWorldRecords(wrValues)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "Unable to load submission context")
      } finally {
        setLoadingContext(false)
      }
    }

    loadContext()
  }, [])

  const invalidPersonalBest = useMemo(() => {
    return submissions.find((submission) => {
      const time = Number(submission.time)
      const personalBest = personalBests[submission.trial_name]
      return Number.isFinite(time) && personalBest && time > personalBest
    })
  }, [personalBests, submissions])

  const canSubmit = useMemo(() => {
    return (
      !loadingContext &&
      !invalidPersonalBest &&
      submissions.every((submission) => {
        const hasTime = Number(submission.time) > 0 && /^\d+(\.\d{1,3})?$/.test(submission.time)
        const hasProof = submission.proof_url.trim().length > 0 || submission.proof_file
        return submission.trial_name && hasTime && hasProof
      })
    )
  }, [invalidPersonalBest, loadingContext, submissions])

  const updateSubmission = (
    id: string,
    values: Partial<SubmissionDraft>
  ) => {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === id ? { ...submission, ...values } : submission
      )
    )
  }

  const updateTime = (id: string, value: string) => {
    if (/^\d*(\.\d{0,3})?$/.test(value)) {
      updateSubmission(id, { time: value })
    }
  }

  const addSubmission = () => {
    setSubmissions((current) => [
      ...current,
      createDraft(crypto.randomUUID()),
    ])
  }

  const removeSubmission = (id: string) => {
    setSubmissions((current) =>
      current.length === 1
        ? current
        : current.filter((submission) => submission.id !== id)
    )
    setUploadStates((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const updateUploadState = (id: string, values: Partial<UploadState>) => {
    setUploadStates((current) => ({
      ...current,
      [id]: {
        ...(current[id] || { progress: 0, status: "idle" as const }),
        ...values,
      },
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!authUser) {
      setSignInDialogOpen(true)
      return
    }

    if (invalidPersonalBest) {
      setError(`${invalidPersonalBest.trial_name} is slower than your current PB`)
      return
    }

    setSubmitting(true)
    setUploadStates(
      Object.fromEntries(
        submissions.map((submission) => [
          submission.id,
          { progress: 0, status: "uploading" as const, message: "Preparing upload" },
        ])
      )
    )

    try {
      await uploadSubmissions(submissions, (progress, status) => {
        setUploadStates((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, state]) => [
              id,
              {
                ...state,
                progress,
                status,
                message:
                  status === "processing"
                    ? "Processing submissions"
                    : status === "done"
                    ? "Uploaded"
                    : `Uploading ${progress}%`,
              },
            ])
          )
        )
      })

      setMessage("Submitted")
      router.push("/submissions")
      router.refresh()
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : "Unable to create submissions"
      setError(message)

      setUploadStates((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, state]) => [
            id,
            {
              ...state,
              progress: 100,
              status: "error",
              message,
            },
          ])
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8"
    >
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">New submission</h1>
            <p className="text-sm text-muted-foreground">Pending review</p>
          </div>
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="h-10 w-full sm:w-auto cursor-pointer"
          >
            {submitting ? <Spinner className="size-4" /> : <UploadIcon />}
            Submit
          </Button>
        </div>
      </div>

      {loadingContext && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading current scores
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={signInDialogOpen} onOpenChange={setSignInDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Login required</AlertDialogTitle>
            <AlertDialogDescription>
              You need to sign in with Discord before you can submit scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a
                href="/api/auth/discord/start"
                className="inline-flex w-full items-center justify-center"
              >
                Sign in with Discord
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-3">
        {submissions.map((submission, index) => {
          const personalBest = personalBests[submission.trial_name]
          const worldRecord = worldRecords[submission.trial_name]
          const uploadState = uploadStates[submission.id]
          const uploadedTime = Number(submission.time)
          const isSlowerThanPb =
            Number.isFinite(uploadedTime) && personalBest && uploadedTime > personalBest
          const score = scoreFor(worldRecord, submission.time, submission.trial_name, personalBest)

          return (
            <Card key={submission.id}>
              <CardHeader className="grid-cols-[1fr_auto]">
                <CardTitle>Submission {index + 1}</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSubmission(submission.id)}
                  disabled={submitting || submissions.length === 1}
                  aria-label={`Remove submission ${index + 1}`}
                >
                  <Trash2Icon className="cursor-pointer" />
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_9rem_7rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={`trial-${submission.id}`}>Trial</Label>
                    <Select
                      value={submission.trial_name}
                      onValueChange={(value) =>
                        updateSubmission(submission.id, {
                          trial_name: value as TrialName,
                        })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger id={`trial-${submission.id}`} className="w-full">
                        <SelectValue placeholder="Select trial" />
                      </SelectTrigger>
                      <SelectContent>
                        {trials.map((trial) => (
                          <SelectItem key={trial} value={trial}>
                            {trial}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`time-${submission.id}`}>Time</Label>
                    <Input
                      id={`time-${submission.id}`}
                      type="text"
                      inputMode="decimal"
                      pattern="^\d+(\.\d{1,3})?$"
                      value={submission.time}
                      onChange={(event) =>
                        updateTime(submission.id, event.target.value)
                      }
                      aria-invalid={Boolean(isSlowerThanPb)}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Score</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input px-2.5 text-sm">
                      {score}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {personalBest && (
                    <p className={isSlowerThanPb ? "text-destructive" : ""}>
                      PB: {formatTime(personalBest)}
                    </p>
                  )}
                  <p>WR: {worldRecord ? formatTime(worldRecord) : "0"}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`proof-url-${submission.id}`}>Medal link</Label>
                    <Input
                      id={`proof-url-${submission.id}`}
                      type="url"
                      inputMode="url"
                      value={submission.proof_url}
                      onChange={(event) =>
                        updateSubmission(submission.id, {
                          proof_url: event.target.value,
                        })
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`proof-file-${submission.id}`}>Video file</Label>
                    <Input
                      id={`proof-file-${submission.id}`}
                      type="file"
                      accept="video/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        const updates: Partial<SubmissionDraft> = { proof_file: file }

                        if (file) {
                          const parsed = parseFilename(file.name)
                          // Only autofill if the field is empty or default value
                          if (parsed.trialName && (!submission.trial_name || submission.trial_name === trials[0])) {
                            updates.trial_name = parsed.trialName
                          }
                          if (parsed.time && !submission.time) {
                            updates.time = parsed.time
                          }
                        }

                        updateSubmission(submission.id, updates)
                      }}
                      disabled={submitting}
                    />
                  </div>
                </div>

                {uploadState && uploadState.status !== "idle" && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <span>{uploadState.message || "Waiting"}</span>
                      <span>{uploadState.progress}%</span>
                    </div>
                    <Progress
                      value={uploadState.progress}
                      aria-label={`Submission ${index + 1} upload progress`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addSubmission}
        disabled={submitting}
        className="h-10 w-full"
      >
        <PlusIcon />
        Add another
      </Button>
    </form>
  )
}
