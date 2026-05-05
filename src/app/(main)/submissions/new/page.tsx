"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { trials } from "@/lib/trials"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

type SubmissionDraft = {
  id: string
  trial_name: string
  time: string
  proof_url: string
  proof_file: File | null
}

type SubmissionValue = {
  trial_name: string
  time: number | string
  state?: string
}

type WorldRecordValue = {
  trial_name: string
  time: number | string
}

type ListResponse<T> = {
  results?: T[]
  error?: string
}

type UploadState = {
  progress: number
  status: "idle" | "uploading" | "processing" | "done" | "error"
  message?: string
}

let cachedWorldRecords: Record<string, number> | null = null
let worldRecordsRequest: Promise<Record<string, number>> | null = null

function createDraft(id = "submission-1"): SubmissionDraft {
  return {
    id,
    trial_name: trials[0],
    time: "",
    proof_url: "",
    proof_file: null,
  }
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

async function getWorldRecords() {
  if (cachedWorldRecords) {
    return cachedWorldRecords
  }

  worldRecordsRequest ??= fetch("/api/wrs")
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

function scoreFor(wr: number | undefined, time: string, personalBest?: number) {
  const parsedTime = time === "" ? personalBest : Number(time)

  if (!wr || !parsedTime || !Number.isFinite(parsedTime) || parsedTime <= 0) {
    return "0.000"
  }

  return Math.min(Math.pow(wr / parsedTime, 3), 1).toFixed(3)
}

function formatTime(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "")
}

function uploadSubmission(
  playerUuid: string,
  submission: SubmissionDraft,
  onProgress: (progress: number, status: UploadState["status"]) => void
) {
  return new Promise<ListResponse<unknown>>((resolve, reject) => {
    const formData = new FormData()
    formData.append("player_uuid", playerUuid)
    formData.append(
      "submissions",
      JSON.stringify([
        {
          trial_name: submission.trial_name,
          time: submission.time,
          proof_url: submission.proof_url.trim(),
        },
      ])
    )

    if (submission.proof_file) {
      formData.append("proof_file_0", submission.proof_file)
    }

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

    onProgress(submission.proof_file ? 0 : 90, submission.proof_file ? "uploading" : "processing")
    request.open("POST", "/api/submissions")
    request.send(formData)
  })
}

export default function NewSubmissionPage() {
  const router = useRouter()
  const [playerUuid] = useState(getPlayerUuid)
  const [personalBests, setPersonalBests] = useState<Record<string, number>>({})
  const [worldRecords, setWorldRecords] = useState<Record<string, number>>({})
  const [loadingContext, setLoadingContext] = useState(() => Boolean(playerUuid))
  const [submissions, setSubmissions] = useState<SubmissionDraft[]>([createDraft()])
  const [submitting, setSubmitting] = useState(false)
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(
    playerUuid ? null : "Player could not be identified"
  )

  useEffect(() => {
    if (!playerUuid) {
      return
    }

    const loadContext = async () => {
      try {
        const [pbResponse, wrValues] = await Promise.all([
          fetch(`/api/submissions/player/${encodeURIComponent(playerUuid)}`),
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
  }, [playerUuid])

  const invalidPersonalBest = useMemo(() => {
    return submissions.find((submission) => {
      const time = Number(submission.time)
      const personalBest = personalBests[submission.trial_name]
      return Number.isFinite(time) && personalBest && time > personalBest
    })
  }, [personalBests, submissions])

  const canSubmit = useMemo(() => {
    return (
      playerUuid.length > 0 &&
      !loadingContext &&
      !invalidPersonalBest &&
      submissions.every((submission) => {
        const hasTime = Number(submission.time) > 0 && /^\d+(\.\d{1,3})?$/.test(submission.time)
        const hasProof = submission.proof_url.trim().length > 0 || submission.proof_file
        return submission.trial_name && hasTime && hasProof
      })
    )
  }, [invalidPersonalBest, loadingContext, playerUuid, submissions])

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

    if (invalidPersonalBest) {
      setError(`${invalidPersonalBest.trial_name} is slower than your current PB`)
      return
    }

    setSubmitting(true)
    setUploadStates(
      Object.fromEntries(
        submissions.map((submission) => [
          submission.id,
          { progress: 0, status: "idle" as const },
        ])
      )
    )

    let activeSubmissionId: string | null = null

    try {
      for (let index = 0; index < submissions.length; index += 1) {
        const submission = submissions[index]
        activeSubmissionId = submission.id

        updateUploadState(submission.id, {
          progress: 0,
          status: "uploading",
          message: `Uploading submission ${index + 1}`,
        })

        await uploadSubmission(playerUuid, submission, (progress, status) => {
          updateUploadState(submission.id, {
            progress,
            status,
            message:
              status === "processing"
                ? "Processing submission"
                : status === "done"
                  ? "Uploaded"
                  : `Uploading ${progress}%`,
          })
        })
      }

      setMessage("Submitted")
      router.push("/submissions")
      router.refresh()
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : "Unable to create submissions"
      setError(message)

      if (activeSubmissionId) {
        updateUploadState(activeSubmissionId, {
          status: "error",
          message,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8"
    >
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

      <div className="flex flex-col gap-3">
        {submissions.map((submission, index) => {
          const personalBest = personalBests[submission.trial_name]
          const worldRecord = worldRecords[submission.trial_name]
          const uploadState = uploadStates[submission.id]
          const uploadedTime = Number(submission.time)
          const isSlowerThanPb =
            Number.isFinite(uploadedTime) && personalBest && uploadedTime > personalBest
          const score = scoreFor(worldRecord, submission.time, personalBest)

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
                    <NativeSelect
                      id={`trial-${submission.id}`}
                      className="w-full"
                      value={submission.trial_name}
                      onChange={(event) =>
                        updateSubmission(submission.id, {
                          trial_name: event.target.value,
                        })
                      }
                      disabled={submitting}
                      required
                    >
                      {trials.map((trial) => (
                        <NativeSelectOption key={trial} value={trial}>
                          {trial}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
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
                      onChange={(event) =>
                        updateSubmission(submission.id, {
                          proof_file: event.target.files?.[0] ?? null,
                        })
                      }
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
