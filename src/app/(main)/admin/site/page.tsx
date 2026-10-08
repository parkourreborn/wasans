import type { Metadata } from "next"
import { AdminSitePage } from "@/components/site/admin/site-page"

export const metadata: Metadata = { title: "Site · Admin" }

export default function Page() {
  return <AdminSitePage />
}
