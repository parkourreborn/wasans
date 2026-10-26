import { Suspense } from "react"
import type { Metadata } from "next"
import { AnalyticsPage } from "@/components/site/analytics/analytics-page"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsRoute() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPage />
    </Suspense>
  )
}
