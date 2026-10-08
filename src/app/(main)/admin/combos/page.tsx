import type { Metadata } from "next"
import { AdminCombosPage } from "@/components/site/admin/combos-page"

export const metadata: Metadata = { title: "Combos · Admin" }

export default function Page() {
  return <AdminCombosPage />
}
