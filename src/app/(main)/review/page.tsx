import { Suspense } from "react"
import type { Metadata } from "next"
import { ReviewQueue, ReviewQueueSkeleton } from "@/components/site/review-queue"

export const metadata: Metadata = { title: "Review" }

export default function ReviewPage() {
  return (
    <Suspense fallback={<ReviewQueueSkeleton />}>
      <ReviewQueue />
    </Suspense>
  )
}
