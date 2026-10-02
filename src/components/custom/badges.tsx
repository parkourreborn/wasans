import { cn } from "@/lib/utils"
import { Badge } from "../ui/badge"

export default function Badges({
  className,
  badges,
}: {
  className?: string
  badges?: string[]
}) {
  const badgeMap: Record<string, React.ReactElement> = {
    wr: <Badge variant="wr" key="wr">WR</Badge>,
    fwr: <Badge variant="fwr" key="fwr">FWR</Badge>,
    approved: <Badge variant="approved" key="approved">Approved</Badge>,
    denied: <Badge variant="denied" key="denied">Denied</Badge>,
    pending: <Badge variant="outline" key="pending">Pending</Badge>,
  }

  return (
    <div className={cn("flex w-fit flex-row items-center justify-between gap-4", className)}>
      {badges?.filter(Boolean).map((badge) => badgeMap[badge])}
    </div>
  )
}
