"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { PlusCircleIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { ComboSubmissionCard } from "@/components/custom/combo-submission-card"
import { PageHeader, PageShell, SubmissionList } from "@/components/custom/page-shell"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

type ComboSubmission = {
  uuid: string
  player_uuid: string
  category_slug: string
  player_name: string
  combo_count: number
  youtube_url: string
  date: number
  moderator_note: string | null
  moderator_username: string | null
  state: "pending" | "approved" | "denied"
  player_id: string | null
  discord_avatar: string | null
  discord_discriminator: string | null
  auth_provider: string | null
}

type ComboSubmissionsResponse = {
  data: ComboSubmission[]
  meta?: { count?: number }
}

type ComboCategory = {
  slug: string
  label: string
  status: "active" | "disabled"
  sort_order: number
  added_at: number
}

type ComboCategoriesResponse = { data: ComboCategory[] }

type AuthResponse = {
  data?: { user?: { uuid: string } | null }
}

const submissionUuidListKey = "submission_uuids"

function formatDate(unixTime: number) {
  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}-${date.getFullYear()}`
}

function ComboSubmissionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<ComboSubmission[]>([])
  const [categories, setCategories] = useState<ComboCategory[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const playerUuidFromParams = searchParams.get("player_uuid") || ""
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [resultCount, setResultCount] = useState(0)
  const [pageInput, setPageInput] = useState<string>("1")

  const categoryLabelBySlug = useMemo(
    () => new Map(categories.map((category) => [category.slug, category.label])),
    [categories]
  )

  const setCurrentPage = (newPage: number) => {
    setPage(newPage)
    setPageInput(String(newPage))
  }

  useEffect(() => {
    const fetchPage = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "50",
        })
        if (playerUuidFromParams) {
          params.set("player_uuid", playerUuidFromParams)
        }
        if (statusFilter !== "all") {
          params.set("state", statusFilter)
        }
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim())
        }

        const response = await fetch(`${apiV2("/combo-submissions")}?${params.toString()}`, { cache: "no-store" })

        if (!response.ok) {
          setError("Failed to load combo submissions")
          setSubmissions([])
          setResultCount(0)
          setTotalPages(1)
          return
        }

        const json = (await response.json()) as ComboSubmissionsResponse
        setSubmissions(json.data || [])
        const count = json.meta?.count ?? 0
        setResultCount(count)
        setTotalPages(Math.max(1, Math.ceil(count / 50)))
      } catch (err) {
        setError("Error loading combo submissions")
        setSubmissions([])
        setResultCount(0)
        setTotalPages(1)
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchPage()
  }, [page, playerUuidFromParams, statusFilter, searchQuery])

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [categoriesResponse, authResponse] = await Promise.all([
          fetch(apiV2("/combo-categories"), { cache: "force-cache" }),
          fetch(apiV2("/auth/me")),
        ])

        if (categoriesResponse.ok) {
          const categoriesJson = (await categoriesResponse.json()) as ComboCategoriesResponse
          setCategories(categoriesJson.data || [])
        }

        if (authResponse.ok) {
          const authJson = (await authResponse.json()) as AuthResponse
          setIsAuthenticated(Boolean(authJson.data?.user))
        } else {
          setIsAuthenticated(false)
        }
      } catch (err) {
        console.error(err)
      }
    }

    fetchMeta()
  }, [])

  useEffect(() => {
    if (loading) {
      return
    }

    window.localStorage.setItem(
      submissionUuidListKey,
      JSON.stringify(submissions.map((submission) => submission.uuid))
    )
  }, [submissions, loading])

  return (
    <PageShell>
      <PageHeader title="Combo Submissions" />

      <div className="sticky top-14 z-30 space-y-3 rounded-lg border border-border bg-background p-4 md:top-0">
        <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search combo submissions by player name"
            aria-label="Search combo submissions by player name"
            className="h-10 w-full min-w-0 lg:flex-1"
          />

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
            >
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
                  router.push("/combos/new")
                } else {
                  setSignInDialogOpen(true)
                }
              }}
            >
              <PlusCircleIcon />
              New submission
            </Button>
          </div>

          <AlertDialog open={signInDialogOpen} onOpenChange={setSignInDialogOpen}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign in with Discord</AlertDialogTitle>
                <AlertDialogDescription>
                  You need to log in before creating a new combo submission. By logging in, you agree to{" "}
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

      <div className="py-4">
        {error ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-destructive">{error}</p>
          </div>
        ) : loading ? (
          <SubmissionList className="submissions-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="submission-grid-item">
                <Card className="h-full overflow-hidden border-border">
                  <CardContent className="flex h-full min-h-0 flex-col gap-3 p-4">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
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
            <p className="text-muted-foreground">No combo submissions available</p>
          </div>
        ) : (
          <>
            <SubmissionList className="submissions-grid">
              {submissions.map((submission) => (
                <ComboSubmissionCard
                  key={submission.uuid}
                  submissionUuid={submission.uuid}
                  categoryLabel={categoryLabelBySlug.get(submission.category_slug) || submission.category_slug}
                  comboCount={submission.combo_count}
                  youtubeUrl={submission.youtube_url}
                  playerUuid={submission.player_uuid}
                  playerName={submission.player_name}
                  playerId={submission.player_id}
                  playerDiscordAvatar={submission.discord_avatar}
                  playerDiscordDiscriminator={submission.discord_discriminator}
                  playerAuthProvider={submission.auth_provider}
                  dateText={formatDate(submission.date)}
                  state={submission.state}
                  moderatorNote={submission.moderator_note}
                  moderatorUsername={submission.moderator_username}
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
                    <PaginationLink href="#" isActive onClick={(event) => event.preventDefault()}>
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
                <label htmlFor="combo-submissions-page" className="text-sm text-muted-foreground">
                  Go to page
                </label>
                <Input
                  id="combo-submissions-page"
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
    </PageShell>
  )
}

function ComboSubmissionsPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ComboSubmissionsPage />
    </Suspense>
  )
}

export default ComboSubmissionsPageWrapper
