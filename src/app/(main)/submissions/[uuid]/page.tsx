"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiV2 } from "@/lib/api"
import TrialSubmissionView, { type TrialSubmissionValue } from "./trial-submission-view"
import ComboSubmissionView, { type ComboSubmissionValue } from "./combo-submission-view"

type TrialSubmissionResponse = {
  data?: { results: TrialSubmissionValue[] }
}

type ComboSubmissionResponse = {
  data?: { results: ComboSubmissionValue[] }
}

type ResolvedSubmission =
  | { kind: "trial"; submission: TrialSubmissionValue }
  | { kind: "combo"; submission: ComboSubmissionValue }
  | { kind: "not-found" }

function SubmissionDetailSkeleton() {
  return (
    <div className="w-full min-h-screen p-4">
      <Card className="w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-4">
            <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Skeleton className="h-8 w-56" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="hidden h-5 w-px sm:block" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="size-9 rounded-md" />
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[52vh] w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function SubmissionDetailPage() {
  const params = useParams<{ uuid: string }>()
  const uuid = params.uuid
  const [resolved, setResolved] = useState<ResolvedSubmission | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const resolveSubmission = async () => {
      setResolved(null)
      setError(null)

      try {
        const [trialResponse, comboResponse] = await Promise.all([
          fetch(apiV2(`/submissions/${uuid}`)),
          fetch(apiV2(`/combo-submissions/${uuid}`)),
        ])

        const [trialJson, comboJson] = await Promise.all([
          trialResponse.ok ? (trialResponse.json().catch(() => null) as Promise<TrialSubmissionResponse | null>) : null,
          comboResponse.ok ? (comboResponse.json().catch(() => null) as Promise<ComboSubmissionResponse | null>) : null,
        ])

        if (cancelled) {
          return
        }

        const trialSubmission = trialJson?.data?.results?.[0]
        const comboSubmission = comboJson?.data?.results?.[0]

        if (trialSubmission) {
          setResolved({ kind: "trial", submission: trialSubmission })
        } else if (comboSubmission) {
          setResolved({ kind: "combo", submission: comboSubmission })
        } else {
          setResolved({ kind: "not-found" })
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        console.error(err)
        setError("Unable to load submission data.")
      }
    }

    resolveSubmission()

    return () => {
      cancelled = true
    }
  }, [uuid])

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

  if (!resolved) {
    return <SubmissionDetailSkeleton />
  }

  if (resolved.kind === "not-found") {
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

  if (resolved.kind === "trial") {
    return <TrialSubmissionView uuid={uuid} initialSubmission={resolved.submission} />
  }

  return <ComboSubmissionView uuid={uuid} initialSubmission={resolved.submission} />
}
