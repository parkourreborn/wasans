import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function Loading() {
  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-4xl w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-40" />
              <Separator orientation="vertical" />
              <Skeleton className="h-6 w-28" />
              <Separator orientation="vertical" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
