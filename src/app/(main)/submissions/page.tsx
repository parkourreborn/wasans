"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Badges from "@/components/custom/badges"
import { ScoreVideoPreview } from "@/components/custom/score-video-preview"
import { formatPlayerNameWithScore } from "@/lib/player-score"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
import { PlusCircleIcon, X, UploadIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { TrialName, trials } from "@/lib/trials"
import calculateScore from "@/lib/calc-score"

type Submission = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  player_score: number
  time: number
  date: string
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
}

type WorldRecord = {
  submission_uuid: string
  trial_name: string
  time: number
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

function mergeSubmissions(current: Submission[], next: Submission[]) {
  const seen = new Set<string>()
  const merged: Submission[] = []

  for (const submission of [...current, ...next]) {
    if (!seen.has(submission.uuid)) {
      seen.add(submission.uuid)
      merged.push(submission)
    }
  }

  return merged
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


function scoreFor(wr: number | undefined, time: string | number, trial: TrialName) {
  const parsedTime = Number(time)

  if (!wr || !parsedTime || !Number.isFinite(parsedTime) || parsedTime <= 0) {
    return "0.000"
  }

  return calculateScore(wr, parsedTime, trial).toFixed(3)
}

function SubmissionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [wrSubmissionIds, setWrSubmissionIds] = useState<Set<string>>(new Set())
  const [worldRecordTimes, setWorldRecordTimes] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [playerFilter, setPlayerFilter] = useState("")
  const [authLabel, setAuthLabel] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [filteredPlayerName, setFilteredPlayerName] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragDialogOpen, setDragDialogOpen] = useState(false)
  const [parsedFileData, setParsedFileData] = useState<{ trialName?: TrialName; time?: string; file: File } | null>(null)
  const [uploadingDragFile, setUploadingDragFile] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<string>("")

  useEffect(() => {
    // Initialize player filter from URL params
    const playerUuid = searchParams.get("player_uuid")
    if (playerUuid) {
      setPlayerFilter(playerUuid)
    }
  }, [searchParams])

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return submissions.filter((submission) => {
      const matchesStatus = statusFilter === "all" || submission.state === statusFilter
      const matchesPlayer = !playerFilter || submission.player_uuid === playerFilter
      const matchesSearch =
        !normalizedQuery ||
        submission.trial_name.toLowerCase().includes(normalizedQuery) ||
        submission.player_name.toLowerCase().includes(normalizedQuery)

      return matchesStatus && matchesPlayer && matchesSearch
    })
  }, [searchQuery, statusFilter, playerFilter, submissions])

  useEffect(() => {
    const fetchPage = async (pageToLoad: number) => {
      setLoadingMore(pageToLoad > 1)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: pageToLoad.toString(),
          limit: "50"
        })
        if (playerFilter) {
          params.set("player_uuid", playerFilter)
        }

        const submissionsResponse = await fetch(
          `/api/submissions?${params.toString()}`,
          { cache: "no-store" }
        )

        if (!submissionsResponse.ok) {
          setError("Failed to load submissions")
          return
        }

        const submissionsJson = (await submissionsResponse.json()) as SubmissionsResponse
        setSubmissions((current) => mergeSubmissions(current, submissionsJson.results || []))
        setHasMore((submissionsJson.results?.length || 0) >= 50)
        setPage(pageToLoad)
      } catch (err) {
        setError("Error loading submissions")
        console.error(err)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    }

    const fetchMeta = async () => {
      try {
        const [wrsResponse, authResponse] = await Promise.all([
          fetch(`/api/wrs`, { cache: "force-cache" }),
          fetch(`/api/auth/me`),
        ])

        if (wrsResponse.ok) {
          const wrsJson = (await wrsResponse.json()) as WorldRecordsResponse
          setWrSubmissionIds(new Set((wrsJson.results || []).map((wr) => wr.submission_uuid)))
          setWorldRecordTimes(
            Object.fromEntries((wrsJson.results || []).map((wr) => [wr.trial_name, Number(wr.time)]))
          )
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
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
          }
        } else {
          setIsAuthenticated(false)
        }

        const authError = new URLSearchParams(window.location.search).get("auth_error")

        if (authError) {
          setError(authError)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchPage(1)
    fetchMeta()
  }, [playerFilter])

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    // Only set drag over to false if we're leaving the main container
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files)
    const videoFile = files.find(file => file.type.startsWith('video/'))

    if (videoFile) {
      const parsed = parseFilename(videoFile.name)
      if (parsed.trialName || parsed.time) {
        setParsedFileData({ ...parsed, file: videoFile })
        setDragDialogOpen(true)
      } else {
        setError("Could not parse trial name or time from filename. Please use the new submission form.")
      }
    } else {
      setError("Please drop a video file.")
    }
  }

  const handleDragUpload = async () => {
    if (!parsedFileData || !isAuthenticated) return

    setUploadingDragFile(true)
    setDragDialogOpen(false)
    setUploadProgress(0)
    setUploadStatus("Preparing upload...")

    return new Promise<void>((resolve, reject) => {
      const formData = new FormData()
      formData.append("submissions", JSON.stringify([{
        trial_name: parsedFileData.trialName || trials[0],
        time: parsedFileData.time || "",
        proof_url: ""
      }]))
      formData.append("proof_file_0", parsedFileData.file)

      const request = new XMLHttpRequest()

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          setUploadProgress(50)
          setUploadStatus("Uploading...")
          return
        }

        const progress = Math.min(Math.round((event.loaded / event.total) * 90), 90)
        setUploadProgress(progress)
        setUploadStatus(`Uploading... ${progress}%`)
      }

      request.upload.onload = () => {
        setUploadProgress(90)
        setUploadStatus("Processing submission...")
      }

      request.onload = () => {
        let json: { error?: string } | null = null

        try {
          json = JSON.parse(request.responseText || "null") as { error?: string } | null
        } catch {
          json = null
        }

        if (request.status >= 200 && request.status < 300) {
          setUploadProgress(100)
          setUploadStatus("Upload complete!")
          setTimeout(() => {
            setUploadingDragFile(false)
            setUploadProgress(0)
            setUploadStatus("")
            setParsedFileData(null)
            window.location.reload()
          }, 1000)
          resolve()
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

      setUploadProgress(0)
      setUploadStatus("Starting upload...")
      request.open("POST", "/api/submissions")
      request.send(formData)
    }).catch((err) => {
      console.error("Upload error:", err)
      setError(err instanceof Error ? err.message : "Failed to upload submission")
      setUploadingDragFile(false)
      setUploadProgress(0)
      setUploadStatus("")
      setParsedFileData(null)
    })
  }

  useEffect(() => {
    if (loading) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(filteredSubmissions.map((submission) => submission.uuid))
    )
  }, [filteredSubmissions, loading])

  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLoadingMore(true)
          const params = new URLSearchParams({
            page: (page + 1).toString(),
            limit: "50"
          })
          if (playerFilter) {
            params.set("player_uuid", playerFilter)
          }

          fetch(`/api/submissions?${params.toString()}`, { cache: "no-store" })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error("Failed to load more submissions")
              }
              const json = (await response.json()) as SubmissionsResponse
              setSubmissions((current) => mergeSubmissions(current, json.results || []))
              setHasMore((json.results?.length || 0) >= 50)
              setPage((current) => current + 1)
            })
            .catch((err) => {
              console.error(err)
              setError("Unable to load more submissions")
            })
            .finally(() => {
              setLoadingMore(false)
            })
        }
      },
      { rootMargin: "200px" }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [loading, loadingMore, hasMore, page, playerFilter])

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
    <div 
      className={`flex h-full w-full flex-col gap-4 ${isDragOver ? 'relative' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploadingDragFile && (
        <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm py-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{uploadStatus}</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        </div>
      )}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <div className="flex flex-col items-center gap-4 text-center">
            <UploadIcon className="h-12 w-12 text-primary" />
            <p className="text-lg font-semibold">Drop your video file here</p>
            <p className="text-sm text-muted-foreground">We'll try to parse the trial name and time from the filename</p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Submissions</h1>
          {filteredPlayerName && (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-sm">
              <span>Filtering by: {filteredPlayerName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPlayerFilter("")}
                className="h-4 w-4 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search submissions by trial or player name"
            aria-label="Search submissions by trial or player name"
            className="h-10 flex-1"
          />

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            className="h-10 w-full cursor-pointer sm:w-auto"
            onClick={() => {
              if (isAuthenticated) {
                router.push("/submissions/new")
              } else {
                setSignInDialogOpen(true)
              }
            }}
          >
            <PlusCircleIcon />
            New submission
          </Button>

          <AlertDialog
            open={signInDialogOpen}
            onOpenChange={setSignInDialogOpen}
          >
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign in with Discord</AlertDialogTitle>
                <AlertDialogDescription>
                  You need to log in before creating a new submission.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <a
                    href="/api/auth/discord/start"
                    className="inline-flex w-full items-center justify-center"
                  >
                    Login with Discord
                  </a>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={dragDialogOpen}
            onOpenChange={setDragDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
                <AlertDialogDescription>
                  We parsed the following data from "{parsedFileData?.file.name}":
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Trial</label>
                    <div className="rounded-md border px-3 py-2 text-sm">
                      {parsedFileData?.trialName || "Not detected - will use default"}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Time</label>
                    <div className="rounded-md border px-3 py-2 text-sm">
                      {parsedFileData?.time || "Not detected - will be empty"}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">File</label>
                    <div className="rounded-md border px-3 py-2 text-sm">
                      {parsedFileData?.file.name}
                    </div>
                  </div>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDragUpload}
                  disabled={uploadingDragFile}
                >
                  {uploadingDragFile ? <Spinner className="size-4 mr-2" /> : null}
                  {uploadingDragFile ? "Uploading..." : "Upload Submission"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {authLabel && <p className="text-sm text-muted-foreground">Logged in as {authLabel}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredSubmissions.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">
              {submissions.length === 0 ? "No submissions available" : "No matching submissions"}
            </p>
          </div>
        ) : (
          <>
            <div className="submissions-grid">
              {filteredSubmissions.map((submission) => (
                <div
                  key={submission.uuid}
                  className="submission-grid-item cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/submissions/${submission.uuid}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      router.push(`/submissions/${submission.uuid}`)
                    }
                  }}
                >
                  <Card className="h-full hover:shadow-lg transition-shadow overflow-hidden">
                    <CardContent className="flex h-full min-h-0 gap-4 p-4">
                      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
                        <ScoreVideoPreview submissionUuid={submission.uuid} />
                        
                      </div>

                      <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                        <div className="w-full flex items-center justify-between gap-2">
                          <h3 className="text-xl font-bold leading-tight xl:text-2xl">
                            {submission.trial_name} {formatTime(submission.time)}
                          </h3>
                        </div>

                        <div className="w-full flex flex-col gap-1.5 text-base">
                          {submission.state !== "denied" ? (
                            <p className="text-sm font-semibold">
                              Score {scoreFor(worldRecordTimes[submission.trial_name], submission.time, submission.trial_name as TrialName)}
                            </p>
                          ) : null}
                          <Link
                            href={`/players/${submission.player_uuid}`}
                            className="text-muted-foreground truncate underline underline-offset-4"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatPlayerNameWithScore(
                              submission.player_name,
                              submission.player_score
                            )}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(submission.date)}
                          </p>
                        </div>

                        <div className="flex items-end justify-between">
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
                      </div>
                    </CardContent>
                    <CardFooter>
                      <div className="w-full flex items-center justify-between">
                        <p className="text-xs text-muted-foreground max-w-full break-words text-center">
                          Moderator Note: {submission.moderator_note}
                        </p>
                      {submission.moderator_username && (
                        <p className="text-xs text-muted-foreground">
                          Mod: {submission.moderator_username}
                        </p>
                      )}
                      </div>
                    </CardFooter>
                  </Card>
                </div>
              ))}
            </div>
            <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
              {loadingMore ? (
                <Spinner className="size-8 text-muted-foreground" />
              ) : hasMore ? (
                <p className="text-sm text-muted-foreground">Scroll to load more submissions</p>
              ) : (
                <p className="text-sm text-muted-foreground">No more submissions</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SubmissionsPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SubmissionsPage />
    </Suspense>
  )
}

export default SubmissionsPageWrapper
