import { headers } from "next/headers"
import Badges from "@/components/custom/badges"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type SubmissionValue = {
  uuid: string
  player_uuid: string
  trial_name: string
  player_name: string
  time: number | string
  date: string
  state: string
}

type SubmissionResponse = {
  results: SubmissionValue[]
}

function formatTime(rawTime: string) {
  const match = rawTime.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return rawTime
  }

  const [, seconds, ms] = match
  const formattedMs = ms.padEnd(3, "0")
  return `${String(Number(seconds))}.${formattedMs}`
}

function formatDate(timestamp: string) {
  const unixTime = parseInt(timestamp, 10)
  if (isNaN(unixTime)) {
    return timestamp
  }

  const date = new Date(unixTime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const year = date.getFullYear()
  return `${month}-${day}-${year}`
}

export default async function Home({ params }: { params: { uuid: string } }) {
  const { uuid } = await params

  const response = await fetch(`https://wasans.tully.sh/api/submissions/${uuid}`, { cache: "no-store" })
  const json: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const errorMessage ="Unable to load submission data."

    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardContent>
            <p className="text-destructive text-center">{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const responseData = json as SubmissionResponse
  const submission = responseData.results?.[0]

  if (!submission) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardContent>
            <p className="text-muted-foreground text-center">No submission found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { player_name, trial_name, date, time: rawTimeValue, state } = submission
  const rawTimeString = String(rawTimeValue)
  const time = formatTime(rawTimeString)
  const formattedDate = formatDate(date)
  const badges = [state === "approved" ? "approved" : state === "denied" ? "denied" : "pending"]
  const videoSrc = `https://assets.wasans.tully.sh/scores/${uuid}.mp4`

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-4xl w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-2">
            <div className="w-full flex items-center justify-between">
              <div className="w-full flex items-center justify-start gap-4">
                <h2 className="lg:text-3xl font-bold">{trial_name} {time}</h2>
                <Separator orientation="vertical" />
                <p className="lg:text-lg text-muted-foreground">{player_name}</p>
                <Separator orientation="vertical" />
                <p className="text-muted-foreground">{formattedDate}</p>
              </div>
            </div>

            <Badges badges={badges} />
          </div>
        </CardHeader>

        <CardContent>
          <video controls className="w-full" src={videoSrc} />
        </CardContent>
      </Card>
    </div>
  )
}
