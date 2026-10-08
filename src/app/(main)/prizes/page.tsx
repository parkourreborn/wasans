import type { Metadata } from "next"
import { PrizesPage } from "@/components/site/prizes-page"

export const metadata: Metadata = { title: "Prizes" }

export default function Page() {
  return <PrizesPage />
}
