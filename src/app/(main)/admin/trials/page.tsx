import type { Metadata } from "next"
import { AdminTrialsPage } from "@/components/site/admin/trials-page"

export const metadata: Metadata = { title: "Trials · Admin" }

export default function Page() {
  return <AdminTrialsPage />
}
