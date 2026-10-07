import Link from "next/link"
import { PageHeader } from "@/components/site/page-header"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <PageHeader
      title="Not found"
      description="There's nothing at this address. It may have moved in the redesign, or the link is mistyped."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/leaderboard">Leaderboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/trials">Trials</Link>
          </Button>
        </div>
      }
    />
  )
}
