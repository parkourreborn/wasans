import type { Metadata } from "next"
import { AdminContentPage } from "@/components/site/admin/content-page"

export const metadata: Metadata = { title: "Content · Admin" }

export default function Page() {
  return <AdminContentPage />
}
