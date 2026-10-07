import type { Metadata } from "next"
import { TrialsIndex } from "@/components/site/trials-index"

export const metadata: Metadata = {
  title: "Trials",
  description: "World records and leaderboards for every Parkour Reborn time trial.",
}

export default function TrialsPage() {
  return <TrialsIndex />
}
