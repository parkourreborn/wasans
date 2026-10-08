"use client"

import { SubmissionsTabs } from "@/components/site/submissions-tabs"
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { apiV2 } from "@/lib/api"
import { isVideoFile } from "@/lib/direct-upload"
import { stashRunFiles } from "@/lib/pending-run-files"
import { usePageFileDrop } from "@/hooks/use-page-file-drop"
import { toast } from "sonner"
import { SubmissionCard } from "@/components/custom/submission-card"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { TrialName } from "@/lib/trials"
import calculateScore from "@/lib/calc-score"
import { PageShell, SubmissionList } from "@/components/custom/page-shell"

type Submission = {
  uuid: string
  player_uuid: string
  player_id?: string | null
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
  discord_id?: string | null
  has_roblox_avatar?: number | null
  trial_name: string
  player_name: string
  player_score: number
  time: number
  date: number
  state: string
  moderator_note?: string | null
  moderator_username?: string | null
  video_status?: "processing" | "ready" | "failed"
}

type WorldRecord = {
  submission_uuid: string
  trial_name: string
  time: number
}

type SubmissionsResponse = {
  data: Submission[]
  meta?: { count?: number }
}

type WorldRecordsResponse = {
  data: WorldRecord[]
}

type AuthResponse = {
  data?: {
    user?: {
      uuid: string
      player_name: string
      score: number
      permission: number
    } | null
  }
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

function formatDate(unixTime: number) {
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
  const playerUuidFromParams = searchParams.get("player_uuid") || ""
  const [playerFilter, setPlayerFilter] = useState(playerUuidFromParams)
  // Set by the failed-video notice so a player can find the runs to redo.
  const [failedOnly, setFailedOnly] = useState(searchParams.get("video_status") === "failed")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [resultCount, setResultCount] = useState(0)
  const filteredPlayerName = playerFilter || null
  const [pageInput, setPageInput] = useState<string>("1")

  const setCurrentPage = (newPage: number) => {
    setPage(newPage)
    setPageInput(String(newPage))
  }

  // Drag and drop state


  useEffect(() => {
    const fetchPage = async () => {
      setLoadingSubmissions(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "50"
        })
        if (playerFilter) {
          params.set("player_uuid", playerFilter)
        }
        if (statusFilter !== "all") {
          params.set("state", statusFilter)
        }
        if (failedOnly) {
          params.set("video_status", "failed")
        }
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim())
        }

        const submissionsResponse = await fetch(
          `${apiV2("/submissions")}?${params.toString()}`,
          { cache: "no-store" }
        )

        if (!submissionsResponse.ok) {
          setError("Failed to load submissions")
          setSubmissions([])
          setResultCount(0)
          setTotalPages(1)
          return
        }

        const submissionsJson = (await submissionsResponse.json()) as SubmissionsResponse
        setSubmissions(submissionsJson.data || [])
        const count = submissionsJson.meta?.count ?? 0
        setResultCount(count)
        setTotalPages(Math.max(1, Math.ceil(count / 50)))
      } catch (err) {
        setError("Error loading submissions")
        setSubmissions([])
        setResultCount(0)
        setTotalPages(1)
        console.error(err)
      } finally {
        setLoadingSubmissions(false)
      }
    }

    fetchPage()
  }, [page, playerFilter, statusFilter, searchQuery, failedOnly])

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [wrsResponse, authResponse] = await Promise.all([
          fetch(apiV2("/records/world"), { cache: "force-cache" }),
          fetch(apiV2("/auth/me")),
        ])

        if (wrsResponse.ok) {
          const wrsJson = (await wrsResponse.json()) as WorldRecordsResponse
          setWrSubmissionIds(new Set((wrsJson.data || []).map((wr) => wr.submission_uuid)))
          setWorldRecordTimes(
            Object.fromEntries((wrsJson.data || []).map((wr) => [wr.trial_name, Number(wr.time)]))
          )
        }

        if (authResponse.ok) {
          const authJson = (await authResponse.json()) as AuthResponse

          if (authJson.data?.user) {
            window.localStorage.setItem("player_uuid", authJson.data?.user.uuid)
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
          }
        } else {
          setIsAuthenticated(false)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchMeta()
  }, [])

  // Videos dropped anywhere here go to the Submit page, one run each, with
  // the trial and time filled in from the file names where they can be.
  const dragging = usePageFileDrop((files) => {
    const videos = files.filter(isVideoFile)
    if (videos.length === 0) {
      toast.error("Only videos can be dropped here.")
      return
    }
    stashRunFiles(videos)
    router.push("/submit")
  })

  useEffect(() => {
    if (loadingSubmissions) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(submissions.map((submission) => submission.uuid))
    )
  }, [submissions, loadingSubmissions])

  return (
    <PageShell className="max-w-[95vw] px-3 md:px-4 lg:px-5">
    <div className="flex h-full w-full flex-col gap-4">
      <SubmissionsTabs active="trials" />
      {dragging ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 border-2 border-dashed border-primary bg-primary/5">
          <div className="absolute inset-x-0 bottom-24 flex justify-center px-4 md:bottom-10">
            <div className="flex items-center gap-2.5 rounded-md border border-line-strong bg-surface-2 px-4 py-3 shadow-lg">
              <UploadIcon className="size-4 shrink-0 text-primary" />
              <span className="text-sm">
                <span className="label-caps text-[14px]">Drop to submit</span>
                <span className="text-muted-foreground"> · opens the Submit page with these videos</span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="sticky top-14 z-30 space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3">
        {filteredPlayerName || failedOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            {filteredPlayerName ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-sm">
                <span>Filtering by: {filteredPlayerName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlayerFilter("")}
                  className="h-4 w-4 p-0"
                  aria-label="Stop filtering by player"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : null}
            {failedOnly ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-sm">
                <span>Failed videos only</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFailedOnly(false)
                    setCurrentPage(1)
                  }}
                  className="h-4 w-4 p-0"
                  aria-label="Show all videos"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search submissions by trial or player name"
            aria-label="Search submissions by trial or player name"
            className="h-10 w-full min-w-0 lg:flex-1"
          />

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
            <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}>
              <SelectTrigger className="w-full sm:w-40">
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
                  router.push("/submit")
                } else {
                  setSignInDialogOpen(true)
                }
              }}
            >
              <PlusCircleIcon />
              New submission
            </Button>
          </div>

          <AlertDialog
            open={signInDialogOpen}
            onOpenChange={setSignInDialogOpen}
          >
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign in with Discord</AlertDialogTitle>
                <AlertDialogDescription>
                  You need to log in before creating a new submission. By logging in, you agree to{" "}
                  <Link href="/terms">Terms</Link>{" "}
                  and{" "}
                  <Link href="/privacy">Privacy</Link>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <a
                    href={apiV2("/auth/discord/start")}
                    className="inline-flex w-full items-center justify-center"
                  >
                    Login with Discord
                  </a>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </div>
      </div>
      <div className="py-4">
        {error ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-destructive">{error}</p>
          </div>
        ) : loadingSubmissions ? (
          <SubmissionList className="submissions-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="submission-grid-item">
                <Card className="h-full overflow-hidden border-border">
                  <CardContent className="flex h-full min-h-0 gap-4 p-4">
                    <Skeleton className="flex-1 rounded-lg" />
                    <div className="flex w-40 shrink-0 flex-col justify-between gap-3 py-1 xl:w-52">
                      <div className="space-y-2">
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <div className="w-full space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  </CardFooter>
                </Card>
              </div>
            ))}
          </SubmissionList>
        ) : submissions.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground">
              No submissions available
            </p>
          </div>
        ) : (
          <>
            <SubmissionList className="submissions-grid">
              {submissions.map((submission) => (
                <SubmissionCard
                  key={submission.uuid}
                  submissionUuid={submission.uuid}
                  trialName={submission.trial_name}
                  timeText={formatTime(submission.time)}
                  playerUuid={submission.player_uuid}
                  playerName={submission.player_name}
                  playerScore={submission.player_score}
                  playerDiscordId={submission.discord_id}
                  playerDiscordAvatar={submission.discord_avatar}
                  playerDiscordDiscriminator={submission.discord_discriminator}
                  playerHasRobloxAvatar={submission.has_roblox_avatar}
                  dateText={formatDate(submission.date)}
                  state={submission.state}
                  isWr={wrSubmissionIds.has(submission.uuid)}
                  scoreText={scoreFor(worldRecordTimes[submission.trial_name], submission.time, submission.trial_name as TrialName)}
                  moderatorNote={submission.moderator_note}
                  moderatorUsername={submission.moderator_username}
                  videoStatus={submission.video_status}
                  className="h-full overflow-hidden transition-colors hover:border-foreground/30"
                  onNavigate={(submissionUuid) => router.push(`/submissions/${submissionUuid}`)}
                />
              ))}
            </SubmissionList>
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                Showing {submissions.length} of {resultCount} submission{resultCount === 1 ? "" : "s"}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      disabled={page === 1}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault()
                        if (page > 1) {
                          setCurrentPage(page - 1)
                        }
                      }}
                    />
                  </PaginationItem>
                  {page > 1 && (
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage(1)
                        }}
                      >
                        1
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  {page > 3 && (
                    <PaginationItem>
                      <span className="px-3 text-sm text-muted-foreground">...</span>
                    </PaginationItem>
                  )}
                  {page > 2 && (
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage(page - 1)
                        }}
                      >
                        {page - 1}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      isActive
                      onClick={(event) => event.preventDefault()}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                  {page < totalPages - 1 && (
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage(page + 1)
                        }}
                      >
                        {page + 1}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  {page < totalPages - 2 && (
                    <PaginationItem>
                      <span className="px-3 text-sm text-muted-foreground">...</span>
                    </PaginationItem>
                  )}
                  {page < totalPages && (
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        onClick={(event) => {
                          event.preventDefault()
                          setCurrentPage(totalPages)
                        }}
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationNext
                      disabled={page === totalPages}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault()
                        if (page < totalPages) {
                          setCurrentPage(page + 1)
                        }
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="flex items-center gap-2">
                <label htmlFor="submissions-page" className="text-sm text-muted-foreground">
                  Go to page
                </label>
                <Input
                  id="submissions-page"
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  className="h-10 w-20"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextPage = Number(pageInput)
                    if (!Number.isNaN(nextPage) && nextPage >= 1 && nextPage <= totalPages) {
                      setCurrentPage(nextPage)
                    }
                  }}
                >
                  Go
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </PageShell>
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
