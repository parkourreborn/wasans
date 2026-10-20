import type { Metadata } from "next"
import { Suspense } from "react"
import { ArchivePage } from "@/components/site/archive-page"

export const metadata: Metadata = {
  title: "WR archive",
  description: "The original file of every Parkour Reborn time trial world record, kept for good and free to download.",
}

export default function Page() {
  return (
    <Suspense>
      <ArchivePage />
    </Suspense>
  )
}
