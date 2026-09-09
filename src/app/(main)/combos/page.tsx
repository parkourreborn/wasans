"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusCircleIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
import { PlayerAvatar } from "@/components/custom/player-avatar"
import { ErrorState, PageHeader, PageShell } from "@/components/custom/page-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type ComboCategory = {
  slug: string
  label: string
  status: "active" | "disabled"
  sort_order: number
  added_at: number
}

type ComboCategoriesResponse = { data?: ComboCategory[]; error?: { message?: string } }

type ComboLeaderboardEntry = {
  player_uuid: string
  player_id: string
  discord_avatar?: string | null
  discord_discriminator?: string | null
  auth_provider?: string | null
  player_name: string
  combo_count: number | null
  submission_uuid: string | null
  date: number | null
  rank: number | null
}

type ComboLeaderboardResponse = { data?: { results?: ComboLeaderboardEntry[] }; error?: { message?: string } }

type AuthResponse = { data?: { user?: { uuid: string } | null } }

function formatDate(unixTime: number) {
  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}-${date.getFullYear()}`
}

export default function CombosLeaderboardPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<ComboCategory[]>([])
  const [activeCategory, setActiveCategory] = useState<string>("")
  const [rows, setRows] = useState<ComboLeaderboardEntry[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true)
      setError(null)

      try {
        const [categoriesResponse, authResponse] = await Promise.all([
          fetch(apiV2("/combo-categories"), { cache: "no-store" }),
          fetch(apiV2("/auth/me")),
        ])

        const categoriesJson = (await categoriesResponse.json()) as ComboCategoriesResponse

        if (!categoriesResponse.ok) {
          throw new Error(categoriesJson.error?.message || "Unable to load combo categories")
        }

        const sorted = [...(categoriesJson.data || [])].sort((a, b) => a.sort_order - b.sort_order)
        setCategories(sorted)
        setActiveCategory((current) => current || sorted[0]?.slug || "")

        if (authResponse.ok) {
          const authJson = (await authResponse.json()) as AuthResponse
          setIsAuthenticated(Boolean(authJson.data?.user))
        }
      } catch (err) {
        console.error(err)
        setError("We couldn't load combo categories right now.")
      } finally {
        setLoadingCategories(false)
      }
    }

    loadCategories()
  }, [])

  useEffect(() => {
    if (!activeCategory) {
      return
    }

    const loadLeaderboard = async () => {
      setLoadingRows(true)
      setError(null)

      try {
        const response = await fetch(
          `${apiV2(`/leaderboards/combos/${encodeURIComponent(activeCategory)}`)}?page=1&limit=500`,
          { cache: "no-store" }
        )
        const json = (await response.json()) as ComboLeaderboardResponse

        if (!response.ok) {
          throw new Error(json.error?.message || "Unable to load combo leaderboard")
        }

        setRows(json.data?.results || [])
      } catch (err) {
        console.error(err)
        setError("We couldn't load this leaderboard right now.")
        setRows([])
      } finally {
        setLoadingRows(false)
      }
    }

    loadLeaderboard()
  }, [activeCategory])

  const rankedRows = useMemo(() => rows.filter((row) => row.combo_count != null), [rows])

  if (loadingCategories) {
    return (
      <PageShell>
        <PageHeader title="Combo Leaderboard" />
        <div className="rounded-lg border border-border p-4">
          <Skeleton className="h-10 w-full md:w-96" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    )
  }

  if (error && categories.length === 0) {
    return (
      <PageShell>
        <PageHeader title="Combo Leaderboard" />
        <ErrorState message={error} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Combo Leaderboard"
        actions={
          <>
            <Button
              type="button"
              className="h-10 cursor-pointer"
              onClick={() => {
                if (isAuthenticated) {
                  router.push("/combos/new")
                } else {
                  setSignInDialogOpen(true)
                }
              }}
            >
              <PlusCircleIcon />
              Submit a combo
            </Button>

            <AlertDialog open={signInDialogOpen} onOpenChange={setSignInDialogOpen}>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign in with Discord</AlertDialogTitle>
                  <AlertDialogDescription>
                    You need to log in before submitting a combo. By logging in, you agree to{" "}
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
          </>
        }
      />

      {categories.length === 0 ? (
        <div className="flex min-h-48 w-full items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-muted-foreground">No combo categories are available yet.</p>
        </div>
      ) : (
        <>
          <div className="sticky top-14 z-30 rounded-lg border border-border bg-background p-4 md:top-0">
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList>
                {categories.map((category) => (
                  <TabsTrigger key={category.slug} className="cursor-pointer" value={category.slug}>
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {error ? (
            <ErrorState message={error} />
          ) : loadingRows ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : rankedRows.length === 0 ? (
            <div className="flex min-h-48 w-full items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground">No approved combo submissions for this category yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rankedRows.map((row) => (
                <Card key={row.player_uuid} className="overflow-hidden transition-colors hover:border-foreground/30">
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-8 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                        #{row.rank}
                      </span>
                      <PlayerAvatar
                        playerName={row.player_name}
                        discordId={row.player_id}
                        discordAvatar={row.discord_avatar}
                        discordDiscriminator={row.discord_discriminator}
                        authProvider={row.auth_provider}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/players/${row.player_uuid}`}
                          className="text-base font-semibold underline underline-offset-4"
                        >
                          {row.player_name}
                        </Link>
                        {row.date != null && (
                          <p className="text-sm text-muted-foreground">{formatDate(row.date)}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-xl font-bold">{row.combo_count?.toLocaleString()}</p>
                      {row.submission_uuid && (
                        <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                          <Link href={`/submissions/${row.submission_uuid}`}>View</Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
