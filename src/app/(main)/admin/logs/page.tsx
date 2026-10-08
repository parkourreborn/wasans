import { Suspense } from "react"
import type { Metadata } from "next"
import { AdminLogsPage } from "@/components/site/admin/logs-page"

export const metadata: Metadata = { title: "Logs · Admin" }

export default function Page() {
  return (
    <Suspense>
      <AdminLogsPage />
    </Suspense>
  )
}
