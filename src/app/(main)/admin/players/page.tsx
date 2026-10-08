import { Suspense } from "react"
import type { Metadata } from "next"
import { AdminPlayersPage } from "@/components/site/admin/players-page"

export const metadata: Metadata = { title: "Players · Admin" }

export default function Page() {
  return (
    <Suspense>
      <AdminPlayersPage />
    </Suspense>
  )
}
