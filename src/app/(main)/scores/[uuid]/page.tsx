import Badges from "@/components/custom/badges"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type ScoreValue = {
  player: string
  trial: string
  time: string
  date: string
}

type ScoreData = {
  key: string
  value: ScoreValue
}

function formatTime(rawTime: string) {
  const match = rawTime.match(/^0*([0-9]+):0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return rawTime
  }

  const [, minutes, seconds, ms] = match
  const formattedMs = ms.padEnd(3, "0")
  return `${String(Number(minutes))}:${String(Number(seconds))}.${formattedMs}`
}

export default async function Home({ params }: { params: { uuid: string } }) {
  const { uuid } = await params
  const response = await fetch(`https://wasans.tully.sh/api/scores/${uuid}`)
  const json: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const errorMessage = "Unable to load score data."

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

  const data = json as ScoreData
  const { player, trial, date, time: rawTime } = data.value
  const time = formatTime(rawTime)
  const videoSrc = `https://assets.wasans.tully.sh/scores/${uuid}.mp4`

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-4xl w-full">
        <CardHeader>
          <div className="w-full flex flex-col gap-2">
            <div className="w-full flex items-center justify-between">
              <div className="w-full flex items-center justify-start gap-4">
                <h2 className="lg:text-3xl font-bold">{trial} {time}</h2>
                <Separator orientation="vertical" />
                <p className="lg:text-lg text-muted-foreground">{player}</p>
                <Separator orientation="vertical" />
                <p className="text-muted-foreground">{date}</p>
              </div>
            </div>

            <Badges badges={["wr", "approved"]} />
          </div>
        </CardHeader>

        <CardContent>
          <video controls className="w-full" src={videoSrc} />
        </CardContent>
      </Card>
    </div>
  )
}
