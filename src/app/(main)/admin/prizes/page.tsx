import type { Metadata } from "next"
import { AdminPrizesPage } from "@/components/site/admin/prizes-page"

export const metadata: Metadata = { title: "Prizes · Admin" }

export default function Page() {
  return <AdminPrizesPage />
}
