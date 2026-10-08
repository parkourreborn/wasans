import { Suspense } from "react"
import type { Metadata } from "next"
import { SubmitPage, SubmitSkeleton } from "@/components/site/submit-page"

export const metadata: Metadata = { title: "Submit" }

export default function SubmitRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-4 pt-10">
          <SubmitSkeleton />
        </div>
      }
    >
      <SubmitPage />
    </Suspense>
  )
}
