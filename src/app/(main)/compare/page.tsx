import { Suspense } from "react"
import type { Metadata } from "next"
import { ComparePage } from "@/components/site/compare-page"

export const metadata: Metadata = { title: "Compare" }

export default function CompareRoute() {
  return (
    <Suspense fallback={null}>
      <ComparePage />
    </Suspense>
  )
}
