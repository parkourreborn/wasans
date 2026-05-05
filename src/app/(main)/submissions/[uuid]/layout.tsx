import type { Metadata } from "next"
import { getCloudflareContext } from "@opennextjs/cloudflare"

type SubmissionMetadataRow = {
  trial_name: string
  player_name: string
  time: number | string
}

type SubmissionLayoutProps = Readonly<{
  children: React.ReactNode
  params: Promise<{ uuid: string }>
}>

const siteUrl = "https://wasans.tully.sh"
const videoBaseUrl = "https://assets.wasans.tully.sh"

function formatTime(rawTime: string) {
  const match = rawTime.match(/^0*([0-9]+)\.(\d{1,3})$/)
  if (!match) {
    return rawTime
  }

  const [, seconds, ms] = match
  const formattedMs = ms.padEnd(3, "0")
  return `${String(Number(seconds))}.${formattedMs}`
}

async function getSubmissionMetadata(uuid: string) {
  const { env } = await getCloudflareContext({ async: true })

  if (!env?.wasans) {
    return null
  }

  return env.wasans.prepare(
    `SELECT trial_name, player_name, time
     FROM submissions
     WHERE uuid = ?`
  )
    .bind(uuid)
    .first<SubmissionMetadataRow>()
}

export async function generateMetadata({ params }: SubmissionLayoutProps): Promise<Metadata> {
  const { uuid } = await params
  const submission = await getSubmissionMetadata(uuid).catch((err) => {
    console.error(err)
    return null
  })

  if (!submission) {
    return {
      title: "Submission | wasans",
    }
  }

  const time = formatTime(String(submission.time))
  const title = `${submission.trial_name} ${time} | ${submission.player_name}`
  const description = `${submission.player_name}'s ${submission.trial_name} submission in ${time}.`
  const pageUrl = `${siteUrl}/submissions/${uuid}`
  const videoUrl = `${videoBaseUrl}/scores/${uuid}.mp4`

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "video.other",
      title,
      description,
      siteName: "wasans",
      url: pageUrl,
      videos: [
        {
          url: videoUrl,
          secureUrl: videoUrl,
          type: "video/mp4",
          width: 1280,
          height: 720,
        },
      ],
    },
    twitter: {
      card: "player",
      title,
      description,
      players: [
        {
          playerUrl: pageUrl,
          streamUrl: videoUrl,
          width: 1280,
          height: 720,
        },
      ],
    },
  }
}

export default function SubmissionLayout({ children }: SubmissionLayoutProps) {
  return children
}
