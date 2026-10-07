import { PageHeader } from "@/components/site/page-header"
import { TierLadder } from "@/components/site/tier-ladder"
import { Skeleton } from "@/components/ui/skeleton"

// What the leaderboard looks like before the client has read the URL and
// fetched a page: the same header and row heights, so nothing jumps.
export function LeaderboardFallback() {
  return (
    <>
      <PageHeader title="Leaderboard" description="Ranked by Wasans score, the average of your best score on every trial.">
        <TierLadder />
      </PageHeader>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-10 pt-6">
        <Skeleton className="h-10 w-full max-w-sm rounded-lg bg-surface-3 sm:w-80" />
        <div className="border-t border-line pt-9">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="flex h-14 items-center gap-3 border-b border-[#1c1c1c] px-3 md:h-12">
              <Skeleton className="h-4 w-6 rounded-sm bg-surface-3" />
              <Skeleton className="size-7 rounded-md bg-surface-3" />
              <Skeleton className="h-4 w-32 rounded-sm bg-surface-3" />
              <Skeleton className="ml-auto h-4 w-14 rounded-sm bg-surface-3" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
