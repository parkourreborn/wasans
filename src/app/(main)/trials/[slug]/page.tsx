import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { trialFromSlug } from "@/lib/trial-slug"
import { PageHeader } from "@/components/site/page-header"
import { TrialPage } from "@/components/site/trial-page"

type TrialRouteProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: TrialRouteProps): Promise<Metadata> {
  const { slug } = await params
  const trial = trialFromSlug(slug)
  return trial
    ? { title: trial, description: `The ${trial} world record, its history, and every runner's best time.` }
    : { title: "Trial not found" }
}

export default async function TrialRoute({ params }: TrialRouteProps) {
  const { slug } = await params
  const trial = trialFromSlug(slug)

  if (!trial) {
    notFound()
  }

  return (
    <Suspense fallback={<PageHeader eyebrow="Trials" title={trial} />}>
      <TrialPage trial={trial} />
    </Suspense>
  )
}
