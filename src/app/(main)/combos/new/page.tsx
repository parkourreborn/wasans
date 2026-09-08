"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { UploadIcon } from "lucide-react"
import { apiV2 } from "@/lib/api"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { getSubmissionErrorMessage } from "@/lib/submission-errors"
import { formatSubmissionBanMessage, type SubmissionBanSummary } from "@/lib/submission-bans"

type ComboCategory = {
  slug: string
  label: string
  status: "active" | "disabled"
  sort_order: number
  added_at: number
}

type ComboCategoriesResponse = { data?: ComboCategory[]; error?: string | { message?: string } }

type AuthResponse = {
  data?: {
    user?: { uuid: string } | null
    submission_ban?: SubmissionBanSummary | null
  }
}

type CreatedComboSubmission = { uuid: string }

type CreateComboSubmissionResponse = {
  data?: { results?: CreatedComboSubmission[] }
  error?: string | { message?: string }
}

export default function NewComboSubmissionPage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<{ uuid: string } | null>(null)
  const [submissionBan, setSubmissionBan] = useState<SubmissionBanSummary | null>(null)
  const [categories, setCategories] = useState<ComboCategory[]>([])
  const [categorySlug, setCategorySlug] = useState("")
  const [comboCount, setComboCount] = useState("")
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [loadingContext, setLoadingContext] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signInDialogOpen, setSignInDialogOpen] = useState(false)

  useEffect(() => {
    const loadContext = async () => {
      try {
        const [authResponse, categoriesResponse] = await Promise.all([
          fetch(apiV2("/auth/me")),
          fetch(apiV2("/combo-categories"), { cache: "no-store" }),
        ])
        const authJson = (await authResponse.json().catch(() => null)) as AuthResponse | null

        if (!authResponse.ok || !authJson?.data?.user) {
          setError("Sign in with Discord to submit a combo.")
          return
        }

        setAuthUser(authJson.data.user)
        setSubmissionBan(authJson.data.submission_ban || null)

        const categoriesJson = (await categoriesResponse.json()) as ComboCategoriesResponse
        if (!categoriesResponse.ok) {
          throw new Error(getSubmissionErrorMessage(categoriesJson.error, "Unable to load combo categories"))
        }

        const sorted = [...(categoriesJson.data || [])].sort((a, b) => a.sort_order - b.sort_order)
        setCategories(sorted)
        setCategorySlug(sorted[0]?.slug || "")
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "Unable to load submission context")
      } finally {
        setLoadingContext(false)
      }
    }

    loadContext()
  }, [])

  const canSubmit = useMemo(() => {
    const parsedCount = Number(comboCount)
    return (
      !loadingContext
      && !submissionBan
      && Boolean(categorySlug)
      && Number.isInteger(parsedCount)
      && parsedCount > 0
      && youtubeUrl.trim().length > 0
    )
  }, [categorySlug, comboCount, loadingContext, submissionBan, youtubeUrl])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!authUser) {
      setSignInDialogOpen(true)
      return
    }

    if (submissionBan) {
      setError(formatSubmissionBanMessage(submissionBan.reason))
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(apiV2("/combo-submissions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category_slug: categorySlug,
          combo_count: Number(comboCount),
          youtube_url: youtubeUrl.trim(),
        }),
      })

      const json = (await response.json().catch(() => null)) as CreateComboSubmissionResponse | null

      if (!response.ok) {
        throw new Error(getSubmissionErrorMessage(json?.error, "Unable to create combo submission"))
      }

      const createdUuid = json?.data?.results?.[0]?.uuid
      router.push(createdUuid ? `/submissions/combos/${createdUuid}` : "/combos")
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Unable to create combo submission")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
      <div className="sticky top-14 z-40 flex flex-col gap-3 border-b border-border bg-background/95 backdrop-blur-sm py-4 md:top-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">New combo submission</h1>
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
          Loading combo categories
        </div>
      )}

      {submissionBan && (
        <Alert variant="destructive">
          <AlertDescription>{formatSubmissionBanMessage(submissionBan.reason)}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={signInDialogOpen} onOpenChange={setSignInDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Login required</AlertDialogTitle>
            <AlertDialogDescription>
              You need to sign in with Discord before you can submit a combo. By signing in, you agree to{" "}
              <Link href="/terms">Terms</Link>{" "}
              and{" "}
              <Link href="/privacy">Privacy</Link>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a href={apiV2("/auth/discord/start")} className="inline-flex w-full items-center justify-center">
                Sign in with Discord
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Combo details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="combo-category">Category</Label>
              <Select value={categorySlug} onValueChange={setCategorySlug} disabled={submitting || loadingContext}>
                <SelectTrigger id="combo-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.slug} value={category.slug}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="combo-count">Combo count</Label>
              <Input
                id="combo-count"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={comboCount}
                onChange={(event) => setComboCount(event.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="combo-youtube-url">YouTube link</Label>
            <Input
              id="combo-youtube-url"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
