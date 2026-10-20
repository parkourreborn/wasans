import type { Metadata } from "next"
import { AdminWrVersionsPage } from "@/components/site/admin/wr-versions-page"

export const metadata: Metadata = { title: "WR versions · Admin" }

export default function Page() {
  return <AdminWrVersionsPage />
}
