import type { Metadata } from "next"
import { AdminWrImportsPage } from "@/components/site/admin/wr-imports-page"

export const metadata: Metadata = { title: "WR Drive import · Admin" }

export default function Page() {
  return <AdminWrImportsPage />
}
